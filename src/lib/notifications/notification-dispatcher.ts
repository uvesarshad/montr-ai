/**
 * Notification dispatcher.
 *
 * The single translator from platform domain events → user notifications. It
 * subscribes to `src/lib/events/domain-bus.ts` and maps the failure / approval /
 * escalation events into `notification-service` calls. Producers stay decoupled:
 * they just emit a domain event; this module decides who gets notified.
 *
 * Runs once in the HTTP/Socket.IO process (wired from server.js). Worker-emitted
 * events arrive here via the domain bus's Redis subscriber. Every mapping uses a
 * `dedupeKey` because the domain bus can deliver an event twice to a same-process
 * subscriber — the notification upsert collapses duplicates.
 */

import { subscribeDomainEvent, type DomainEventEnvelope } from '@/lib/events/domain-bus';
import { notifyUser, notifyAdmins } from './notification-service';

let initialized = false;

function str(v: unknown): string | undefined {
    return v == null ? undefined : String(v);
}

export function initNotificationDispatcher(): void {
    if (initialized) return;
    initialized = true;

    // ---- Automation / workflow failures ----
    subscribeDomainEvent('workflow.execution_failed', async (env: DomainEventEnvelope) => {
        const p = env.payload as Record<string, unknown>;
        const userId = str(p.userId);
        if (!userId) return;
        const workflowName = str(p.workflowName) || 'A workflow';
        await notifyUser(userId, {
            type: 'failure.automation',
            title: `${workflowName} failed`,
            body: str(p.error) || 'The automation run ended with an error.',
            source: { module: 'automation', entityType: 'execution', entityId: str(p.executionId) },
            actionUrl: p.workflowId ? `/canvas/${str(p.workflowId)}` : undefined,
            actionLabel: 'Open workflow',
            data: { workflowId: str(p.workflowId), executionId: str(p.executionId) },
            dedupeKey: `wf-failed:${str(p.executionId) || str(p.workflowId)}`,
        });
    });

    // ---- AI Studio generation failures ----
    subscribeDomainEvent('ai_studio.generation_failed', async (env: DomainEventEnvelope) => {
        const p = env.payload as Record<string, unknown>;
        const userId = str(p.userId);
        if (!userId) return;
        await notifyUser(userId, {
            type: 'failure.ai_studio',
            title: 'AI Studio generation failed',
            body: str(p.error) || 'A generation did not complete.',
            source: { module: 'ai-studio', entityType: 'project', entityId: str(p.projectId) || str(p.sessionId) },
            actionUrl: p.projectId ? `/ai-studio/${str(p.projectId)}` : '/ai-studio',
            actionLabel: 'Open AI Studio',
            data: { projectId: str(p.projectId), sessionId: str(p.sessionId) },
            dedupeKey: `aistudio-failed:${str(p.sessionId) || str(p.projectId)}`,
        });
    });

    // ---- Integration connection expiry (token refresh exhausted) ----
    subscribeDomainEvent('integration.connection_expired', async (env: DomainEventEnvelope) => {
        const p = env.payload as Record<string, unknown>;
        const userId = str(p.userId);
        if (!userId) return;
        const provider = str(p.provider) || 'An integration';
        await notifyUser(userId, {
            type: 'failure.integration',
            title: `${provider.charAt(0).toUpperCase()}${provider.slice(1)} connection expired`,
            body: 'The stored access token could not be refreshed. Reconnect the account to keep workflows running.',
            source: { module: 'integrations', entityType: 'connection', entityId: str(p.connectionId) },
            actionUrl: '/settings?tab=connections',
            actionLabel: 'Reconnect',
            data: { connectionId: str(p.connectionId), provider: str(p.provider) },
            dedupeKey: `intg-expired:${str(p.connectionId)}`,
        });
    });

    // ---- Notion doc sync failures ----
    subscribeDomainEvent('docs.notion_sync_failed', async (env: DomainEventEnvelope) => {
        const p = env.payload as Record<string, unknown>;
        const userId = str(p.userId);
        if (!userId) return;
        const documentId = str(p.documentId);
        await notifyUser(userId, {
            type: 'failure.doc_sync',
            title: 'Notion sync failed',
            body: str(p.error) || 'A document could not be synced with Notion.',
            source: { module: 'docs', entityType: 'document', entityId: documentId },
            actionUrl: documentId ? `/docs/${documentId}` : '/docs',
            actionLabel: 'Open document',
            data: { documentId, linkId: str(p.linkId), externalTitle: str(p.externalTitle) },
            dedupeKey: `notion-sync-failed:${str(p.linkId) || documentId}`,
        });
    });

    // ---- Ad lead CRM sync failures (notify org admins) ----
    subscribeDomainEvent('ads.lead_sync_failed', async (env: DomainEventEnvelope) => {
        const p = env.payload as Record<string, unknown>;
        const leadId = str(p.leadId);
        const platform = str(p.platform) === 'meta_ads' ? 'Meta Ads' : 'Google Ads';
        await notifyAdmins({
            type: 'failure.ad_lead',
            title: `${platform} lead failed to sync to CRM`,
            body: str(p.error) || 'A captured lead could not be written to the CRM.',
            source: { module: 'ads', entityType: 'ad_lead', entityId: leadId },
            actionUrl: '/ads/leads?status=failed',
            actionLabel: 'Review leads',
            data: { leadId, platform: str(p.platform), campaignName: str(p.campaignName) },
            dedupeKey: leadId ? `ad-lead-failed:${leadId}` : undefined,
        });
    });

    // ---- Weekly ads summary (notify org admins) ----
    subscribeDomainEvent('ads.weekly_summary', async (env: DomainEventEnvelope) => {
        const p = env.payload as Record<string, unknown>;
        const spend = typeof p.spend === 'number' ? p.spend : 0;
        const clicks = typeof p.clicks === 'number' ? p.clicks : 0;
        const conversions = typeof p.conversions === 'number' ? p.conversions : 0;
        const deltaPct = typeof p.spendDeltaPct === 'number' ? p.spendDeltaPct : null;
        const delta = deltaPct === null ? '' : ` (${deltaPct >= 0 ? '+' : ''}${deltaPct}% WoW)`;
        await notifyAdmins({
            type: 'digest.ads_weekly',
            title: 'Your weekly ads summary',
            body: `Spend $${spend.toLocaleString()}${delta} · ${clicks.toLocaleString()} clicks · ${conversions.toLocaleString()} conversions in the last 7 days.`,
            source: { module: 'ads', entityType: 'summary', entityId: str(p.weekKey) },
            actionUrl: '/ads',
            actionLabel: 'Open Ads',
            data: { spend, clicks, conversions, spendDeltaPct: deltaPct },
            dedupeKey: `ads-weekly:${env.organizationId}:${str(p.weekKey)}`,
        });
    });

    // ---- Voice call failures (notify org admins) ----
    subscribeDomainEvent('voice.call_failed', async (env: DomainEventEnvelope) => {
        const p = env.payload as Record<string, unknown>;
        const callId = str(p.callSessionId) || str(p.callId) || str(p.sid);
        await notifyAdmins({
            type: 'failure.voice',
            title: 'Voice call failed',
            body: str(p.error) || str(p.reason) || 'A voice call could not be completed.',
            source: { module: 'voice', entityType: 'call', entityId: callId },
            actionUrl: '/voice',
            actionLabel: 'Open Voice',
            data: { callId, to: str(p.to), from: str(p.from) },
            dedupeKey: callId ? `voice-failed:${callId}` : undefined,
        });
    });

    // ---- AI bot / conversation escalations (notify org admins) ----
    subscribeDomainEvent('ai_bot.escalation_requested', async (env: DomainEventEnvelope) => {
        const p = env.payload as Record<string, unknown>;
        const conversationId = str(p.conversationId);
        const channel = str(p.channel) || 'conversation';
        await notifyAdmins({
            type: 'failure.conversation',
            title: 'A conversation was escalated to a human',
            body: str(p.reason) || `An AI bot handed off a ${channel} conversation.`,
            source: { module: 'ai-bots', entityType: 'conversation', entityId: conversationId },
            actionUrl: '/inbox',
            actionLabel: 'Open inbox',
            data: { conversationId, channel, aiBotId: str(p.aiBotId) },
            dedupeKey: conversationId ? `escalation:${conversationId}` : undefined,
        });
    });

    // ---- Approval requested → notify org admins (actionable) ----
    subscribeDomainEvent('post.approval_requested', async (env: DomainEventEnvelope) => {
        const p = env.payload as Record<string, unknown>;
        const approvalId = str(p.approvalId);
        await notifyAdmins({
            type: 'approval.requested',
            severity: str(p.priority) === 'high' ? 'error' : 'warning',
            title: 'A post needs your approval',
            body: 'A team member submitted content for review.',
            requiresAction: true,
            source: { module: 'approvals', entityType: 'approval', entityId: approvalId },
            actionUrl: '/approvals',
            actionLabel: 'Review',
            data: { approvalId, subjectId: str(p.subjectId) },
            dedupeKey: approvalId ? `approval-req:${approvalId}` : undefined,
        });
    });

    // ---- Approval decided → notify the original submitter ----
    const onDecision = (decision: 'approved' | 'rejected') => async (env: DomainEventEnvelope) => {
        const p = env.payload as Record<string, unknown>;
        const approvalId = str(p.approvalId);
        if (!approvalId) return;
        // The submitter isn't in the event payload — look it up.
        let submittedBy: string | undefined;
        try {
            const { ApprovalRequest } = await import('@/lib/db/models/approval-request.model');
            const approval = await ApprovalRequest.findById(approvalId).select('submittedBy').lean();
            submittedBy = approval ? String((approval as { submittedBy: unknown }).submittedBy) : undefined;
        } catch (err) {
            console.error('[notifications] approval lookup failed:', err);
        }
        if (!submittedBy) return;
        await notifyUser(submittedBy, {
            type: decision === 'approved' ? 'approval.approved' : 'approval.rejected',
            title: decision === 'approved' ? 'Your post was approved' : 'Your post was rejected',
            body: str(p.reviewNote) || undefined,
            source: { module: 'approvals', entityType: 'approval', entityId: approvalId },
            actionUrl: '/approvals',
            data: { approvalId, subjectId: str(p.subjectId), reviewedBy: str(p.reviewedBy) },
            dedupeKey: `approval-${decision}:${approvalId}`,
        });
    };
    subscribeDomainEvent('post.approved', onDecision('approved'));
    subscribeDomainEvent('post.rejected', onDecision('rejected'));

    console.log('[notifications] dispatcher initialized');
}
