/**
 * Agent Daily Briefing (Phase 1, 2026-06-05)
 *
 * Proactive owner-facing digest of what the agent did, what's pending, and
 * what's coming — per brand, sent only when there was agent activity in the
 * look-back window. Delivered as an in-app notification (email rides the
 * existing digest/severity rules) and mirrored into the Agent Workspace
 * (Reports/) as a readable doc.
 *
 * Runs from the notification-digest worker on its own daily cron
 * ('send-agent-briefing', 09:00). Idempotent per brand per day via dedupeKey.
 */

import AgentMission from '@/lib/db/models/agent-mission.model';
import PendingAgentAction from '@/lib/db/models/pending-agent-action.model';
import AgentScheduledTask from '@/lib/db/models/agent-scheduled-task.model';
import { notifyUser } from '@/lib/notifications/notification-service';
import { writeWorkspaceDoc } from '@/lib/agent/workspace';
import { dbConnect } from '@/lib/db/connect';

const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const LOOKAHEAD_MS = 24 * 60 * 60 * 1000;

interface BrandActivity {
    brandId: string;
    userIds: Set<string>;
    completed: { title: string; id: string }[];
    blocked: { title: string; id: string }[];
    active: number;
    hibernating: number;
}

export async function runAgentBriefings(): Promise<{ sent: number }> {
    await dbConnect();

    const since = new Date(Date.now() - LOOKBACK_MS);
    const until = new Date(Date.now() + LOOKAHEAD_MS);
    const today = new Date().toISOString().slice(0, 10);

    // Brands with agent activity in the window.
    const recentMissions = await AgentMission.find({
        lastActivityAt: { $gte: since },
    }).select('_id organizationId brandId userId title status').limit(2000).exec();

    const byBrand = new Map<string, BrandActivity>();
    for (const mission of recentMissions) {
        const key = `${mission.userId}:${mission.brandId}`;
        if (!byBrand.has(key)) {
            byBrand.set(key, {
                brandId: mission.brandId,
                userIds: new Set(),
                completed: [],
                blocked: [],
                active: 0,
                hibernating: 0,
            });
        }
        const entry = byBrand.get(key)!;
        entry.userIds.add(mission.userId);
        const item = { title: mission.title, id: mission._id.toString() };
        if (mission.status === 'completed') entry.completed.push(item);
        else if (mission.status === 'blocked') entry.blocked.push(item);
        else if (mission.status === 'active' || mission.status === 'waiting') entry.active++;
        else if (mission.status === 'scheduled') entry.hibernating++;
    }

    let sent = 0;

    for (const activity of byBrand.values()) {
        try {
            const [pendingApprovals, upcomingTasks] = await Promise.all([
                PendingAgentAction.countDocuments({
                    brandId: activity.brandId,
                    status: 'pending',
                }).exec(),
                AgentScheduledTask.find({
                    brandId: activity.brandId,
                    status: 'active',
                    nextRunAt: { $lte: until },
                }).select('name nextRunAt').limit(10).exec(),
            ]);

            const parts: string[] = [];
            if (activity.completed.length) parts.push(`${activity.completed.length} mission(s) completed`);
            if (activity.blocked.length) parts.push(`${activity.blocked.length} blocked`);
            if (activity.active) parts.push(`${activity.active} in progress`);
            if (activity.hibernating) parts.push(`${activity.hibernating} hibernating`);
            if (pendingApprovals) parts.push(`${pendingApprovals} approval(s) waiting on you`);
            const headline = parts.join(' · ') || 'Agent activity in the last 24 hours';

            // Workspace report (one per brand per day — owner-readable detail).
            const ownerId = activity.userIds.values().next().value as string;
            const listHtml = (items: { title: string; id: string }[]) =>
                items.slice(0, 10).map((m) => `<li><a href="/agent/missions/${m.id}">${escapeHtml(m.title)}</a></li>`).join('');
            const content = `<h1>Agent briefing — ${today}</h1>
<p>${escapeHtml(headline)}.</p>
${activity.completed.length ? `<h2>Completed</h2><ul>${listHtml(activity.completed)}</ul>` : ''}
${activity.blocked.length ? `<h2>Blocked — needs you</h2><ul>${listHtml(activity.blocked)}</ul>` : ''}
${pendingApprovals ? `<h2>Approvals</h2><p>${pendingApprovals} action(s) waiting in the <a href="/agent/approvals">approval queue</a>.</p>` : ''}
${upcomingTasks.length ? `<h2>Coming up (24h)</h2><ul>${upcomingTasks.map((t) => `<li>${escapeHtml(t.name)} — ${t.nextRunAt?.toISOString()}</li>`).join('')}</ul>` : ''}
<p><em>Written automatically by your agent.</em></p>`;

            let reportDocId: string | undefined;
            try {
                const report = await writeWorkspaceDoc({
                    userId: ownerId,
                    brandId: activity.brandId,
                    folder: 'Reports',
                    title: `Agent briefing — ${today}`,
                    content,
                });
                reportDocId = report.docId;
            } catch (error) {
                console.error('[AgentBriefing] workspace report failed:', error);
            }

            // Notify every user who drove agent activity on this brand.
            for (const userId of activity.userIds) {
                await notifyUser(userId, {
                    type: 'task.completed',
                    title: 'Your agent\'s daily briefing',
                    body: headline,
                    source: { module: 'agent', entityType: 'briefing', entityId: activity.brandId },
                    actionUrl: reportDocId ? `/docs/${reportDocId}` : '/agent',
                    actionLabel: 'Read briefing',
                    dedupeKey: `agent-brief:${activity.brandId}:${userId}:${today}`,
                }).catch((err) => console.error('[AgentBriefing] notify failed:', err));
            }

            sent++;
        } catch (error) {
            console.error(`[AgentBriefing] Failed for brand ${activity.brandId}:`, error);
        }
    }

    return { sent };
}

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
