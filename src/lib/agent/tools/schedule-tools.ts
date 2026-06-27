/**
 * Agent Self-Scheduling Tools (Phase 1, 2026-06-05)
 *
 * Gives the agent the ability to schedule its own future work:
 *   - create/list/cancel scheduled tool runs (agent_scheduled_tasks)
 *   - create/list/delete event-triggered missions (agent_mission_triggers)
 *   - sleep_until — hibernate the current mission until a wake time
 *
 * Creation tools are danger-listed in the HITL gateway (always approved by a
 * human); capacity is capped per brand by the plan's agent.maxActiveSchedules
 * (super-admin editable). sleep_until is mission-control (never gated) but
 * plan-gated inside hibernateMission.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { AgentContext } from './types';
import { toolRegistry } from '../tool-registry';
import {
    createScheduledTask,
    listScheduledTasks,
    toggleScheduledTask,
} from '@/lib/agent/scheduled-task-runner';
import { hibernateMission, checkScheduleCapacity } from '@/lib/agent/long-horizon';
import { getMissionTemplateById, getMissionTemplates } from '@/lib/agent/mission-templates';
import AgentScheduledTask from '@/lib/db/models/agent-scheduled-task.model';
import MissionTrigger, { MissionTriggerEventType } from '@/lib/db/models/mission-trigger.model';
import { dbConnect } from '@/lib/db/connect';

/** Tools the agent may NOT schedule — prevents recursive scheduling and unsupervised gate-bypass. */
const UNSCHEDULABLE_TOOLS = new Set([
    'create_scheduled_task',
    'cancel_scheduled_task',
    'create_mission_trigger',
    'delete_mission_trigger',
    'sleep_until',
    'delegate_to_agent',
]);

const TRIGGER_EVENT_TYPES = [
    'form.submitted',
    'contact.created',
    'deal.stage_changed',
    'deal.won',
    'deal.lost',
    'email.received',
    'campaign.completed',
    // Phase 2 — inbound-channel events
    'whatsapp.message_received',
    'message.received',
    'ai_bot.escalation_requested',
    'ads.lead_captured',
    'meeting.booked',
    'voice.call_completed',
] as const;

// ─── create_scheduled_task ────────────────────────────────────────────────────

const createScheduledTaskParams = z.object({
    name: z.string().min(3).max(120).describe('Human-readable name, e.g. "Morning ads performance check".'),
    description: z.string().max(500).optional().describe('What this schedule accomplishes and why.'),
    toolName: z.string().describe('The registered tool to run on each tick (e.g. get_ads_insights).'),
    toolArgs: z.record(z.unknown()).describe('Arguments passed to the tool on each run.'),
    cronExpression: z.string().describe('5-part cron, e.g. "0 9 * * *" (daily 09:00) or "0 9 * * 1" (Mondays 09:00).'),
    timezone: z.string().optional().describe('IANA timezone (default UTC).'),
    maxRuns: z.number().int().min(1).max(365).optional().describe('Auto-complete after N runs (omit for indefinite).'),
});

export const createScheduledTaskTool = {
    name: 'create_scheduled_task',
    description: 'Schedule a tool to run automatically on a cron cadence (e.g. check ad performance every morning). Requires user approval. Capacity is limited by plan.',
    parameters: createScheduledTaskParams,
    hitlPolicy: 'always' as const,
    factory: (context: AgentContext) => tool({
        description: 'Schedule a recurring tool run.',
        parameters: createScheduledTaskParams,
        execute: async (args) => {
            try {
                if (UNSCHEDULABLE_TOOLS.has(args.toolName)) {
                    return { success: false, error: `Tool "${args.toolName}" cannot be scheduled.` };
                }
                if (!toolRegistry.getTool(args.toolName)) {
                    return { success: false, error: `Tool "${args.toolName}" is not registered.` };
                }

                const capacity = await checkScheduleCapacity({
                    userId: context.userId,
                    brandId: context.brandId || context.userId,
                });
                if (!capacity.ok) return { success: false, error: capacity.error };

                const task = await createScheduledTask({
                    brandId: context.brandId || context.userId,
                    userId: context.userId,
                    missionId: context.missionId,
                    name: args.name,
                    description: args.description ?? `Agent-created schedule for ${args.toolName}`,
                    toolName: args.toolName,
                    toolArgs: args.toolArgs as Record<string, unknown>,
                    cronExpression: args.cronExpression,
                    timezone: args.timezone,
                    maxRuns: args.maxRuns,
                });

                return {
                    success: true,
                    taskId: task._id.toString(),
                    nextRunAt: task.nextRunAt?.toISOString(),
                    message: `Scheduled "${args.name}" — first run ${task.nextRunAt?.toISOString()}.`,
                    deepLink: '/agent/scheduled',
                };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

// ─── list_scheduled_tasks ─────────────────────────────────────────────────────

const listScheduledTasksParams = z.object({
    status: z.enum(['active', 'paused', 'completed', 'failed']).optional().describe('Filter by status.'),
});

export const listScheduledTasksTool = {
    name: 'list_scheduled_tasks',
    description: 'List the scheduled tasks for this brand — names, cadence, next run, last result.',
    parameters: listScheduledTasksParams,
    hitlPolicy: 'never' as const,
    factory: (context: AgentContext) => tool({
        description: 'List scheduled tasks for the brand.',
        parameters: listScheduledTasksParams,
        execute: async (args) => {
            try {
                const tasks = await listScheduledTasks({
                    brandId: context.brandId || undefined,
                    status: args.status,
                });
                return {
                    success: true,
                    total: tasks.length,
                    tasks: tasks.map((t) => ({
                        id: t._id.toString(),
                        name: t.name,
                        toolName: t.toolName,
                        cronExpression: t.cronExpression,
                        status: t.status,
                        nextRunAt: t.nextRunAt?.toISOString(),
                        lastRunAt: t.lastRunAt?.toISOString(),
                        lastResult: t.lastResult?.message,
                        runCount: t.runCount,
                    })),
                };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

// ─── cancel_scheduled_task ────────────────────────────────────────────────────

const cancelScheduledTaskParams = z.object({
    taskId: z.string().describe('The scheduled task ID (from list_scheduled_tasks).'),
    mode: z.enum(['pause', 'delete']).default('pause').describe('pause keeps the task for later; delete removes it.'),
});

export const cancelScheduledTaskTool = {
    name: 'cancel_scheduled_task',
    description: 'Pause or delete one of this brand\'s scheduled tasks.',
    parameters: cancelScheduledTaskParams,
    factory: (context: AgentContext) => tool({
        description: 'Pause or delete a scheduled task.',
        parameters: cancelScheduledTaskParams,
        execute: async (args) => {
            try {
                await dbConnect();
                // Scope check — never mutate another org's task.
                const task = await AgentScheduledTask.findOne({
                    _id: args.taskId
                }).exec();
                if (!task) return { success: false, error: 'Scheduled task not found in this organization.' };

                if (args.mode === 'delete') {
                    await AgentScheduledTask.deleteOne({ _id: args.taskId }).exec();
                    return { success: true, message: `Deleted scheduled task "${task.name}".` };
                }

                await toggleScheduledTask(args.taskId, 'paused');
                return { success: true, message: `Paused scheduled task "${task.name}".` };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

// ─── create_mission_trigger ───────────────────────────────────────────────────

const createMissionTriggerParams = z.object({
    name: z.string().min(3).max(120).describe('Human-readable trigger name, e.g. "Follow up new leads".'),
    eventType: z.enum(TRIGGER_EVENT_TYPES).describe('Platform event that fires this trigger.'),
    templateId: z.string().describe('Mission template to spawn (see mission templates catalog).'),
    conditions: z.record(z.unknown()).optional().describe('Optional metadata match, e.g. { "stageId": "..." }. All keys must match.'),
    missionMode: z.enum(['mixed', 'approval-first', 'autonomous', 'watch']).optional()
        .describe('Mode for spawned missions (default mixed). autonomous = the mission starts working immediately; sends still respect HITL.'),
});

export const createMissionTriggerTool = {
    name: 'create_mission_trigger',
    description: 'Subscribe to a platform event (new contact, deal won, email received…) so a mission is auto-created when it fires. Requires user approval. Capacity is limited by plan.',
    parameters: createMissionTriggerParams,
    hitlPolicy: 'always' as const,
    factory: (context: AgentContext) => tool({
        description: 'Create an event-triggered mission.',
        parameters: createMissionTriggerParams,
        execute: async (args) => {
            try {
                const template = getMissionTemplateById(args.templateId);
                if (!template) {
                    return {
                        success: false,
                        error: `Unknown mission template "${args.templateId}". Valid templates: ${getMissionTemplates().map(t => t.id).join(', ')}.`,
                    };
                }

                const capacity = await checkScheduleCapacity({
                    userId: context.userId,
                    brandId: context.brandId || context.userId,
                });
                if (!capacity.ok) return { success: false, error: capacity.error };

                await dbConnect();
                const trigger = await MissionTrigger.create({
                    brandId: context.brandId || context.userId,
                    userId: context.userId,
                    templateId: args.templateId,
                    name: args.name,
                    eventType: args.eventType as MissionTriggerEventType,
                    conditions: args.conditions ? JSON.stringify(args.conditions) : null,
                    missionMode: args.missionMode ?? 'mixed',
                    enabled: true,
                });

                return {
                    success: true,
                    triggerId: trigger._id.toString(),
                    message: `Trigger "${args.name}" active: ${args.eventType} → ${template.title}.`,
                    deepLink: '/agent/settings',
                };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

// ─── list_mission_triggers ────────────────────────────────────────────────────

export const listMissionTriggersTool = {
    name: 'list_mission_triggers',
    description: 'List the event triggers configured for this brand.',
    parameters: z.object({}),
    hitlPolicy: 'never' as const,
    factory: (context: AgentContext) => tool({
        description: 'List event-triggered mission configs.',
        parameters: z.object({}),
        execute: async () => {
            try {
                await dbConnect();
                const triggers = await MissionTrigger.find({
                    ...(context.brandId ? { brandId: context.brandId } : {}),
                }).sort({ createdAt: -1 }).exec();

                return {
                    success: true,
                    total: triggers.length,
                    triggers: triggers.map((t) => ({
                        id: t._id.toString(),
                        name: t.name,
                        eventType: t.eventType,
                        templateId: t.templateId,
                        enabled: t.enabled,
                        triggerCount: t.triggerCount,
                        lastTriggeredAt: t.lastTriggeredAt?.toISOString(),
                    })),
                };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

// ─── delete_mission_trigger ───────────────────────────────────────────────────

const deleteMissionTriggerParams = z.object({
    triggerId: z.string().describe('The trigger ID (from list_mission_triggers).'),
});

export const deleteMissionTriggerTool = {
    name: 'delete_mission_trigger',
    description: 'Disable and remove one of this brand\'s event triggers.',
    parameters: deleteMissionTriggerParams,
    factory: (context: AgentContext) => tool({
        description: 'Delete an event trigger.',
        parameters: deleteMissionTriggerParams,
        execute: async (args) => {
            try {
                await dbConnect();
                const trigger = await MissionTrigger.findOneAndDelete({
                    _id: args.triggerId
                }).exec();
                if (!trigger) return { success: false, error: 'Trigger not found in this organization.' };
                return { success: true, message: `Deleted trigger "${trigger.name}".` };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

// ─── sleep_until ──────────────────────────────────────────────────────────────

const sleepUntilParams = z.object({
    minutes: z.number().int().min(5).max(60 * 24 * 30).optional()
        .describe('Sleep duration in minutes from now (5 min – 30 days).'),
    until: z.string().optional()
        .describe('Absolute wake time as an ISO-8601 datetime. Use minutes OR until.'),
    reason: z.string().min(5).max(300)
        .describe('Why you are pausing and what you will check on wake, e.g. "Waiting 24h for campaign metrics to accumulate".'),
});

export const sleepUntilTool = {
    name: 'sleep_until',
    description: 'Pause this mission until a future time without burning budget (long-horizon work: wait for metrics, content to publish, replies to arrive). The mission wakes automatically and continues. The minimum sleep is set by the plan.',
    parameters: sleepUntilParams,
    factory: (context: AgentContext) => tool({
        description: 'Hibernate the mission until a wake time.',
        parameters: sleepUntilParams,
        execute: async (args) => {
            try {
                if (!context.missionId) {
                    return { success: false, error: 'sleep_until requires an active mission.' };
                }

                let requestedWakeAt: Date;
                if (args.until) {
                    const parsed = new Date(args.until);
                    if (Number.isNaN(parsed.getTime())) {
                        return { success: false, error: `Could not parse "until" as a date: ${args.until}` };
                    }
                    requestedWakeAt = parsed;
                } else if (args.minutes) {
                    requestedWakeAt = new Date(Date.now() + args.minutes * 60 * 1000);
                } else {
                    return { success: false, error: 'Provide either minutes or until.' };
                }

                const result = await hibernateMission({
                    missionId: context.missionId,
                    brandId: context.brandId || context.userId,
                    userId: context.userId,
                    requestedWakeAt,
                    reason: args.reason,
                });

                if (!result.success) return result;
                return {
                    success: true,
                    wakeAt: result.wakeAt,
                    message: `Mission hibernating — wakes at ${result.wakeAt}. Stop working now; you will be re-invoked on wake.`,
                };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

toolRegistry.register(createScheduledTaskTool);
toolRegistry.register(listScheduledTasksTool);
toolRegistry.register(cancelScheduledTaskTool);
toolRegistry.register(createMissionTriggerTool);
toolRegistry.register(listMissionTriggersTool);
toolRegistry.register(deleteMissionTriggerTool);
toolRegistry.register(sleepUntilTool);
