/**
 * Long-Horizon Missions — hibernate / wake (Phase 1, 2026-06-05)
 *
 * A mission working toward a multi-day goal should not burn its wall-clock
 * budget idling. Instead the agent calls the `sleep_until` tool: the mission
 * parks in status 'scheduled' with a `wakeAt` timestamp, and the agent-tasks
 * cron (every 5 min) wakes due missions — status back to 'active', a fresh
 * wall-clock session starts (`sessionStartedAt`), idle turns reset, and an
 * autonomous continuation is dispatched.
 *
 * Plan gating (D3): hibernation and agent self-scheduling are disabled when
 * the plan's `agent.maxActiveSchedules` is 0. The plan's
 * `agent.minWakeIntervalMinutes` floors how soon a mission may wake again —
 * super-admin editable per plan in the admin plans panel.
 */

import AgentMission, { IAgentMission } from '@/lib/db/models/agent-mission.model';
import { agentMissionRepository } from '@/lib/db/repository/agent-mission.repository';
import { dispatchMissionContinuation } from '@/lib/queue/queue';
import { notifyUser } from '@/lib/notifications/notification-service';
import { checkAgentGate } from '@/lib/agent/plan-gate';
import { dbConnect } from '@/lib/db/connect';

export interface HibernateResult {
    success: boolean;
    wakeAt?: string;
    error?: string;
}

/**
 * Park a mission until `requestedWakeAt`. The effective wake time is floored
 * by the plan's minWakeIntervalMinutes.
 */
export async function hibernateMission(params: {
    missionId: string;
    brandId: string;
    userId: string;
    requestedWakeAt: Date;
    reason: string;
}): Promise<HibernateResult> {
    await dbConnect();

    const gate = await checkAgentGate({ userId: params.userId });
    if (gate.maxActiveSchedules === 0) {
        return {
            success: false,
            error: 'Long-horizon missions are not available on your plan. The mission must finish its work in the current session.',
        };
    }

    const minWakeMs = Math.max(5, gate.minWakeIntervalMinutes) * 60 * 1000;
    const floor = new Date(Date.now() + minWakeMs);
    const wakeAt = params.requestedWakeAt > floor ? params.requestedWakeAt : floor;

    const updated = await AgentMission.findOneAndUpdate(
        {
            _id: params.missionId,
            status: { $in: ['active', 'waiting'] },
        },
        {
            $set: {
                status: 'scheduled',
                wakeAt,
                wakeReason: params.reason,
            },
        },
        { new: true },
    ).exec();

    if (!updated) {
        return { success: false, error: 'Mission not found or not in a hibernatable state.' };
    }

    await agentMissionRepository.appendEvent({
        missionId: params.missionId,
        brandId: params.brandId,
        userId: params.userId,
        type: 'status_change',
        role: 'system',
        content: `Mission hibernating until ${wakeAt.toISOString()}: ${params.reason}`,
        metadata: {
            hibernation: true,
            wakeAt: wakeAt.toISOString(),
            reason: params.reason,
        },
    }).catch((error) => {
        console.error('[LongHorizon] Failed to append hibernate event:', error);
    });

    return { success: true, wakeAt: wakeAt.toISOString() };
}

/**
 * Wake all missions whose wakeAt has passed. Called by the agent-tasks cron
 * worker (same 5-minute tick as processScheduledTasks).
 *
 * Autonomous/autopilot missions get a continuation dispatched immediately;
 * supervised missions just become 'active' and the owner is notified.
 */
export async function wakeDueMissions(): Promise<number> {
    await dbConnect();

    const now = new Date();
    const due = await AgentMission.find({
        status: 'scheduled',
        wakeAt: { $ne: null, $lte: now },
    }).limit(50).exec();

    let woken = 0;

    for (const mission of due) {
        try {
            await wakeMission(mission);
            woken++;
        } catch (error) {
            console.error(`[LongHorizon] Failed to wake mission ${mission._id}:`, error);
        }
    }

    return woken;
}

async function wakeMission(mission: IAgentMission): Promise<void> {
    const missionId = mission._id.toString();
    const now = new Date();

    await AgentMission.updateOne(
        { _id: missionId, status: 'scheduled' },
        {
            $set: {
                status: 'active',
                wakeAt: null,
                sessionStartedAt: now,
                'usage.idleTurns': 0,
                lastActivityAt: now,
            },
            $inc: { wakeCount: 1 },
        },
    ).exec();

    await agentMissionRepository.appendEvent({
        missionId,
        brandId: mission.brandId,
        userId: mission.userId,
        type: 'status_change',
        role: 'system',
        content: `Mission woke from hibernation (wake #${(mission.wakeCount ?? 0) + 1}).`,
        metadata: {
            hibernation: true,
            wake: true,
            previousReason: mission.wakeReason ?? undefined,
        },
    }).catch((error) => {
        console.error('[LongHorizon] Failed to append wake event:', error);
    });

    if (mission.mode === 'autonomous' || mission.mode === 'autopilot') {
        await dispatchMissionContinuation({
            missionId,
            userId: mission.userId,
            brandId: mission.brandId,
            continuationPrompt: mission.wakeReason
                ? `You are waking from a scheduled pause. You paused because: "${mission.wakeReason}". Check progress toward the mission goal, act on what has changed, and either continue working, sleep again with sleep_until, or call completeMission.`
                : undefined,
            iteration: 0,
        }, 1000);
    } else {
        void notifyUser(mission.userId, {
            type: 'task.completed',
            title: `Mission "${mission.title}" is awake`,
            body: mission.wakeReason
                ? `Scheduled check-in: ${mission.wakeReason}`
                : 'The mission woke from its scheduled pause and is ready to continue.',
            source: { module: 'agent', entityType: 'mission', entityId: missionId },
            actionUrl: `/agent/missions/${missionId}`,
            actionLabel: 'Open mission',
            dedupeKey: `mission-wake:${missionId}:${(mission.wakeCount ?? 0) + 1}`,
        }).catch((err) => console.error('[LongHorizon] wake notify failed:', err));
    }
}

/**
 * Count agent-managed active schedules for a brand (scheduled tasks + enabled
 * mission triggers) against the plan cap. -1 = unlimited.
 */
export async function checkScheduleCapacity(params: {
    userId: string;
    brandId: string;
}): Promise<{ ok: boolean; remaining: number; max: number; error?: string }> {
    await dbConnect();

    const gate = await checkAgentGate({ userId: params.userId });
    const max = gate.maxActiveSchedules;

    if (max === 0) {
        return { ok: false, remaining: 0, max, error: 'Agent self-scheduling is not available on your plan.' };
    }
    if (max === -1) {
        return { ok: true, remaining: Number.MAX_SAFE_INTEGER, max };
    }

    const [{ default: AgentScheduledTask }, { default: MissionTrigger }] = await Promise.all([
        import('@/lib/db/models/agent-scheduled-task.model'),
        import('@/lib/db/models/mission-trigger.model'),
    ]);

    const [taskCount, triggerCount] = await Promise.all([
        AgentScheduledTask.countDocuments({
            brandId: params.brandId,
            status: 'active',
        }).exec(),
        MissionTrigger.countDocuments({
            brandId: params.brandId,
            enabled: true,
        }).exec(),
    ]);

    const used = taskCount + triggerCount;
    if (used >= max) {
        return {
            ok: false,
            remaining: 0,
            max,
            error: `Schedule cap reached (${used}/${max} active schedules and triggers on this brand). Cancel one first or upgrade the plan.`,
        };
    }

    return { ok: true, remaining: max - used, max };
}
