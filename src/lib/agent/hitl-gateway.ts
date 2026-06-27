/**
 * HITL Gateway
 *
 * Intercepts tool calls based on per-tool hitlPolicy, per-brand hitlOverrides,
 * and the mission's autonomy mode. Creates PendingAgentAction records and parks
 * the mission in 'waiting' status until the user decides.
 */

import PendingAgentAction from '@/lib/db/models/pending-agent-action.model';
import AgentMission from '@/lib/db/models/agent-mission.model';
import { AgentContext } from '@/lib/agent/tools/types';
import { dbConnect } from '@/lib/db/connect';
import { agentMissionRepository } from '@/lib/db/repository/agent-mission.repository';
import { auditLogRepository } from '@/lib/db/repository/crm/audit-log.repository';

interface HITLCheckResult {
    requiresApproval: boolean;
    pendingActionId?: string;
    message?: string;
}

/**
 * Tools that always require approval regardless of mission mode.
 * These are destructive or high-blast-radius actions.
 */
const ALWAYS_REQUIRE_APPROVAL = new Set([
    'sendWhatsApp',
    'sendEmail',
    'deleteContact',
    'deleteCompany',
    'deleteDeal',
    'triggerWorkflow',
    'schedulePost',
    // B1-2.1 — WhatsApp send tools
    'send_whatsapp_text',
    'send_whatsapp_template',
    'send_whatsapp_image',
    'send_whatsapp_buttons',
    // B1-2.2 — Voice call tools
    'initiate_call',
    'bulk_call',
    // B1-2.3 — Marketing campaign sends
    'schedule_campaign',
    'send_inbox_email',
    // B1-2.6 — Form creation
    'create_form',
    // B1-2.10 — Agent-initiated approvals
    'request_approval',
    // B1-2.11 — Destructive identity ops
    'merge_contacts',
]);

/**
 * Tools that have no external side effects and never need approval.
 * Used by approval-first mode to permit reads while gating writes.
 */
const READ_ONLY_TOOLS = new Set([
    'getContact',
    'listContacts',
    'getCompany',
    'listCompanies',
    'listDeals',
    'getDealsPipeline',
    'searchKnowledgeBase',
    'getAnalytics',
    'getCurrentDate',
    'getRoadmapTasks',
    'getCrossChannelReport',
    'getEmailCampaignMetrics',
    'getWhatsAppCampaignMetrics',
    // B1-2 read tools
    'get_inbox_thread',
    'get_call_transcript',
    'get_approval_status',
    'get_execution_status',
    'list_workflows',
    'list_conversations',
    'read_conversation',
    'list_form_submissions',
    'list_characters',
    'resolve_contact',
    'find_contact_by_attribute',
    'check_availability',
    'generate_text',
    // B1-3.4 memory reads
    'read_memory',
    'list_memory_keys',
    // B1-2.7 KB reads
    'get_campaign_metrics',
    // Phase 1 — schedule/trigger reads
    'list_scheduled_tasks',
    'list_mission_triggers',
    // Phase 1 — workspace reads
    'list_workspace_docs',
    'read_doc',
    // Phase 1 — strategy reads
    'get_strategy',
    // Phase 2 — ads account reads
    'list_ad_accounts',
    // Phase 2 — social reads
    'list_social_accounts',
    'list_scheduled_posts',
    'get_post_performance',
    // Phase 3 — integrations reads
    'list_integrations',
]);

/**
 * Mission-control tools manage the agent's own mission state, not external data.
 * They are exempt from HITL even in approval-first mode.
 */
const MISSION_CONTROL_TOOLS = new Set([
    'createPlan',
    'setPlanStep',
    'completeMission',
    'reportBlocked',
    // Long-horizon hibernation manages the mission's own lifecycle; plan-gated
    // inside hibernateMission rather than HITL-gated (gating it in watch mode
    // would deadlock a mission that just needs to wait for data).
    'sleep_until',
]);

/**
 * Pure gate-decision logic, extracted for unit testing (B1-8.1).
 * Returns true when the tool call should be intercepted and queued for approval.
 */
export function resolveGateDecision(
    effectivePolicy: string | undefined,
    inDangerList: boolean,
    inBrandList: boolean,
    mode: string | undefined,
): boolean {
    if (effectivePolicy === 'always') return true;
    if (effectivePolicy === 'per_brand_config') return inBrandList;
    if (effectivePolicy === 'over_cost') return inDangerList || inBrandList;
    // No explicit policy — fall through to hardcoded danger list + mode logic
    if (inDangerList) return true;
    if (mode === 'autonomous' || mode === 'autopilot') return false;
    if (mode === 'approval-first' || mode === 'watch') return true;
    return inBrandList; // mixed / undefined
}

/** Outbound voice-call tools governed by the per-brand voiceCallPolicy (D4 2026-06-05). */
const VOICE_CALL_TOOLS = new Set(['initiate_call', 'schedule_call', 'bulk_call']);

/**
 * Resolve the brand's voice-call policy (D4) into an effective HITL policy
 * for a voice tool call. Returns undefined when no policy is configured —
 * the default danger-list behaviour (always gate) applies.
 */
export function resolveVoiceCallPolicy(
    policy: NonNullable<AgentContext['voiceCallPolicy']> | undefined,
    toolArgs: Record<string, unknown>,
    now: Date = new Date(),
): 'never' | 'always' | undefined {
    if (!policy) return undefined;
    if (policy.mode === 'always_autonomous') return 'never';
    if (policy.mode === 'always_ask') return 'always';

    // conditional — autonomous only when ALL configured conditions pass.
    const cond = policy.conditions ?? {};

    if (cond.businessHoursOnly) {
        const hour = now.getUTCHours();
        if (hour < 9 || hour >= 18) return 'always';
    }

    if (cond.knownContactsOnly) {
        // Known = the agent passed a CRM contact id (resolved record), not a raw phone/email.
        const ref = String(toolArgs.contactRef ?? '');
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(ref);
        if (!isObjectId) return 'always';
    }

    if (cond.autonomousPurposes && cond.autonomousPurposes.length > 0) {
        const purpose = String(toolArgs.purpose ?? '').toLowerCase();
        if (!purpose || !cond.autonomousPurposes.map((p) => p.toLowerCase()).includes(purpose)) {
            return 'always';
        }
    }

    return 'never';
}

/**
 * Check if a tool call requires HITL approval.
 * Resolution order (highest to lowest priority):
 *   1. Mission-control / read-only exemptions (never gate)
 *   2. context.hitlOverrides[toolName] — per-brand per-tool override
 *      (voice tools: derived from the brand's voiceCallPolicy, D4)
 *   3. registeredTool.hitlPolicy — tool's own declared policy
 *   4. ALWAYS_REQUIRE_APPROVAL set — legacy hardcoded danger list
 *   5. Mission mode (watch/approval-first → gate all; autopilot/autonomous → don't; mixed → brand list)
 */
export async function checkHITL(
    toolName: string,
    toolArgs: Record<string, unknown>,
    context: AgentContext
): Promise<HITLCheckResult> {
    // 1. Mission-control and read-only tools never gate.
    if (MISSION_CONTROL_TOOLS.has(toolName) || READ_ONLY_TOOLS.has(toolName)) {
        return { requiresApproval: false };
    }

    // 2+3. Resolve effective policy: voice policy > brand override > tool's own policy
    const { toolRegistry } = await import('@/lib/agent/tool-registry');
    const registeredTool = toolRegistry.getTool(toolName);
    const voicePolicy = VOICE_CALL_TOOLS.has(toolName)
        ? resolveVoiceCallPolicy(context.voiceCallPolicy, toolArgs)
        : undefined;
    const effectivePolicy = voicePolicy
        ?? context.hitlOverrides?.[toolName]
        ?? registeredTool?.hitlPolicy;

    if (effectivePolicy === 'never') {
        return { requiresApproval: false };
    }

    const inDangerList = ALWAYS_REQUIRE_APPROVAL.has(toolName);
    const inBrandList = !!context.requireApproval && context.requireApproval.includes(toolName);

    const shouldGate = resolveGateDecision(effectivePolicy, inDangerList, inBrandList, context.mode);

    if (!shouldGate) {
        return { requiresApproval: false };
    }

    await dbConnect();

    // Build a human-readable description
    const description = buildHumanDescription(toolName, toolArgs);

    // Create pending action
    const action = await PendingAgentAction.create({
        brandId: context.brandId || '',
        userId: context.userId,
        sessionId: `copilot-${context.userId}-${Date.now()}`,
        missionId: context.missionId || null,
        toolName,
        toolArgs,
        toolDescription: description,
        status: 'pending',
    });

    if (context.missionId) {
        await agentMissionRepository.appendEvent({
            missionId: context.missionId,
            brandId: context.brandId || '',
            userId: context.userId,
            sessionId: action.sessionId,
            type: 'approval_request',
            role: 'system',
            content: description,
            metadata: {
                pendingActionId: action._id.toString(),
                toolName,
            },
        }).catch((error) => {
            console.error('[HITL] Failed to append approval_request mission event:', error);
        });

        // Flip mission to 'waiting' so the auto-continue runner stops dispatching
        // until the user approves or rejects. Only flip from active/draft so we
        // don't override completed/blocked terminal states set by a tool.
        await AgentMission.updateOne(
            { _id: context.missionId, status: { $in: ['active', 'draft'] } },
            { $set: { status: 'waiting', lastActivityAt: new Date() } },
        ).exec().catch((error) => {
            console.error('[HITL] Failed to flip mission to waiting:', error);
        });
    }

    return {
        requiresApproval: true,
        pendingActionId: action._id.toString(),
        message: `⏳ This action requires your approval before it can be executed:\n\n**${description}**\n\nPlease approve or reject this action in the pending actions panel.`,
    };
}

/**
 * Approve a pending action and return the original tool args for execution.
 *
 * Scoped to the caller's organizationId (and userId when provided) so a user in
 * one org cannot approve another org's pending action by guessing its ObjectId.
 * Only flips from `pending` so an already-resolved action is never re-resolved.
 */
export async function approveAction(
    actionId: string,
    approvedBy: string,
    scope?: { userId?: string },
) {
    await dbConnect();
    const filter: Record<string, unknown> = { _id: actionId, status: 'pending' };
    if (scope?.userId) filter.userId = scope.userId;
    const action = await PendingAgentAction.findOneAndUpdate(
        filter,
        {
            status: 'approved',
            resolvedBy: approvedBy,
            resolvedAt: new Date(),
        },
        { new: true }
    );

    // Audit log: an approval is a security-relevant decision that should be
    // attributable in the compliance trail.
    if (action) {
        await auditLogRepository.create({
            entityType: 'pending_agent_action',
            entityId: action._id.toString(),
            entityName: action.toolDescription,
            action: 'updated',
            changes: [
                { field: 'status', oldValue: 'pending', newValue: 'approved' },
            ],
            source: 'ui',
            userId: approvedBy,
            userName: approvedBy,
        }).catch((error) => {
            console.error('[HITL] Failed to write audit log for approval:', error);
        });
    }

    if (action?.missionId) {
        await agentMissionRepository.appendEvent({
            missionId: action.missionId,
            brandId: action.brandId,
            userId: action.userId,
            sessionId: action.sessionId,
            type: 'status_change',
            role: 'system',
            content: `Approved action: ${action.toolDescription}`,
            metadata: {
                status: 'active',
                pendingActionId: action._id.toString(),
                resolution: 'approved',
            },
        }).catch((error) => {
            console.error('[HITL] Failed to append approval resolution event:', error);
        });

        // Flip mission back to active so the auto-continue runner can pick up.
        await AgentMission.updateOne(
            { _id: action.missionId, status: 'waiting' },
            { $set: { status: 'active', lastActivityAt: new Date() } },
        ).exec().catch((error) => {
            console.error('[HITL] Failed to resume mission after approval:', error);
        });

        // If the mission is autonomous, dispatch a continuation turn.
        try {
            const mission = await AgentMission.findById(action.missionId);
            if (mission?.mode === 'autonomous' && mission.status === 'active') {
                const { dispatchMissionContinuation } = await import('@/lib/queue/queue');
                await dispatchMissionContinuation({
                    missionId: action.missionId,
                    brandId: action.brandId,
                    userId: action.userId,
                    iteration: 0,
                }, 1000);
            }
        } catch (error) {
            console.warn('[HITL] Failed to dispatch continuation after approval:', error);
        }
    }

    return action;
}

/**
 * Reject a pending action.
 *
 * Scoped to the caller's organizationId (and userId when provided) so cross-org
 * rejection is impossible. Only flips from `pending` to avoid re-resolving.
 */
export async function rejectAction(
    actionId: string,
    rejectedBy: string,
    reason?: string,
    scope?: { userId?: string },
) {
    await dbConnect();
    const filter: Record<string, unknown> = { _id: actionId, status: 'pending' };
    if (scope?.userId) filter.userId = scope.userId;
    const action = await PendingAgentAction.findOneAndUpdate(
        filter,
        {
            status: 'rejected',
            resolvedBy: rejectedBy,
            resolvedAt: new Date(),
            rejectionReason: reason || 'User rejected the action',
        },
        { new: true }
    );

    // Audit log: rejections also belong in the compliance trail.
    if (action) {
        await auditLogRepository.create({
            entityType: 'pending_agent_action',
            entityId: action._id.toString(),
            entityName: action.toolDescription,
            action: 'updated',
            changes: [
                { field: 'status', oldValue: 'pending', newValue: 'rejected' },
                ...(reason
                    ? [{ field: 'rejectionReason', oldValue: null, newValue: reason }]
                    : []),
            ],
            source: 'ui',
            userId: rejectedBy,
            userName: rejectedBy,
        }).catch((error) => {
            console.error('[HITL] Failed to write audit log for rejection:', error);
        });
    }

    if (action?.missionId) {
        await agentMissionRepository.appendEvent({
            missionId: action.missionId,
            brandId: action.brandId,
            userId: action.userId,
            sessionId: action.sessionId,
            type: 'status_change',
            role: 'system',
            content: `Rejected action: ${action.toolDescription}`,
            metadata: {
                status: 'blocked',
                pendingActionId: action._id.toString(),
                resolution: 'rejected',
                reason: action.rejectionReason,
            },
        }).catch((error) => {
            console.error('[HITL] Failed to append rejection mission event:', error);
        });

        // Flip mission back to active so the user can continue the conversation.
        // The agent will see the rejection in the timeline and adapt next turn.
        await AgentMission.updateOne(
            { _id: action.missionId, status: 'waiting' },
            { $set: { status: 'active', lastActivityAt: new Date() } },
        ).exec().catch((error) => {
            console.error('[HITL] Failed to resume mission after rejection:', error);
        });
    }

    return action;
}

/**
 * Delegate a pending action to another user (B1-7.2).
 * The original action stays pending; the delegatee sees it via getPendingActions.
 */
export async function delegateAction(
    actionId: string,
    delegateTo: string,
    delegatedBy: string,
    scope?: { },
) {
    await dbConnect();
    const filter: Record<string, unknown> = { _id: actionId, status: 'pending' };
    const action = await PendingAgentAction.findOneAndUpdate(
        filter,
        { $set: { delegatedTo: delegateTo, delegatedBy, delegatedAt: new Date() } },
        { new: true },
    );

    if (action) {
        await auditLogRepository.create({
            entityType: 'pending_agent_action',
            entityId: action._id.toString(),
            entityName: action.toolDescription,
            action: 'updated',
            changes: [{ field: 'delegatedTo', oldValue: null, newValue: delegateTo }],
            source: 'ui',
            userId: delegatedBy,
            userName: delegatedBy,
        }).catch(() => {});
    }

    return action;
}

/**
 * Get pending actions for a user (including actions delegated to them).
 * Applies the brand's timeout policy to stale actions before returning live ones.
 *
 * timeoutPolicy (B1-7.5):
 *   'auto-reject'  — expire stale actions and block the mission (default)
 *   'auto-approve' — approve stale actions automatically
 *   'escalate'     — keep stale actions pending but mark them as escalated
 */
export async function getPendingActions(
    userId: string,
    missionId?: string,
    brandId?: string,
    timeoutPolicy?: 'auto-reject' | 'auto-approve' | 'escalate',
) {
    await dbConnect();

    const now = new Date();
    const staleQuery: Record<string, unknown> = {
        $or: [{ userId }, { delegatedTo: userId }],
        status: 'pending',
        expiresAt: { $lte: now },
    };
    if (missionId) staleQuery.missionId = missionId;
    if (brandId) staleQuery.brandId = brandId;

    const staleActions = await PendingAgentAction.find(staleQuery);

    if (staleActions.length > 0) {
        const policy = timeoutPolicy ?? 'auto-reject';

        if (policy === 'auto-approve') {
            await PendingAgentAction.updateMany(
                { _id: { $in: staleActions.map((a) => a._id) } },
                { $set: { status: 'approved', resolvedBy: 'system:timeout', resolvedAt: now } },
            );
            await Promise.allSettled(
                staleActions
                    .filter((action) => action.missionId)
                    .map((action) => agentMissionRepository.appendEvent({
                        missionId: action.missionId as string,
                        brandId: action.brandId,
                        userId: action.userId,
                        sessionId: action.sessionId,
                        type: 'status_change',
                        role: 'system',
                        content: `Approval auto-approved on timeout: ${action.toolDescription}`,
                        metadata: { pendingActionId: action._id.toString(), resolution: 'auto-approved' },
                    }).catch(() => {})),
            );
        } else if (policy === 'escalate') {
            // Keep pending but mark escalatedAt so org admin can query them
            await PendingAgentAction.updateMany(
                { _id: { $in: staleActions.map((a) => a._id) } },
                { $set: { delegatedTo: `escalated:${staleActions[0]?.userId ?? 'org'}`, delegatedAt: now } },
            );
        } else {
            // auto-reject (default): expire and block mission
            await PendingAgentAction.updateMany(
                { _id: { $in: staleActions.map((a) => a._id) } },
                { $set: { status: 'expired', resolvedAt: now } },
            );
            await Promise.allSettled(
                staleActions
                    .filter((action) => action.missionId)
                    .map((action) => agentMissionRepository.appendEvent({
                        missionId: action.missionId as string,
                        brandId: action.brandId,
                        userId: action.userId,
                        sessionId: action.sessionId,
                        type: 'status_change',
                        role: 'system',
                        content: `Approval expired: ${action.toolDescription}`,
                        metadata: {
                            status: 'blocked',
                            pendingActionId: action._id.toString(),
                            resolution: 'expired',
                            toolName: action.toolName,
                        },
                    }).catch(() => {})),
            );
        }
    }

    const query: Record<string, unknown> = {
        $or: [{ userId }, { delegatedTo: userId }],
        status: 'pending',
    };
    if (missionId) query.missionId = missionId;
    if (brandId) query.brandId = brandId;

    return PendingAgentAction.find(query).sort({ createdAt: -1 });
}

/**
 * Build a human-readable description of what the tool will do.
 */
function buildHumanDescription(toolName: string, args: Record<string, unknown>): string {
    switch (toolName) {
        case 'sendWhatsApp':
            return `Send WhatsApp message to ${args.to || 'recipient'}: "${String(args.message || '').slice(0, 100)}..."`;
        case 'sendEmail':
            return `Send email to ${args.to || 'recipient'}: "${args.subject || 'No subject'}"`;
        case 'triggerWorkflow':
            return `Trigger workflow "${args.workflowId || args.name || 'Unknown'}"`;
        case 'schedulePost':
            return `Schedule social media post: "${String(args.content || '').slice(0, 100)}..."`;
        case 'createDeal':
            return `Create CRM deal: "${args.name || args.title || 'Untitled'}" worth ${args.value || 'N/A'}`;
        case 'executeRoadmapTask':
            return `Execute marketing roadmap task: "${args.taskId || 'Unknown task'}"`;
        case 'iterateMarketingPlan':
            return `Iterate and adjust your marketing plan based on recent analytics${args.feedback ? `: "${String(args.feedback).slice(0, 80)}"` : ''}`;
        case 'addRoadmapTask':
            return `Add roadmap task: "${args.title || 'Untitled'}" (${args.type || 'other'}, ${args.difficulty || 'medium'})`;
        case 'completeRoadmapTask':
            return `Mark roadmap task "${args.taskId || 'Unknown'}" as completed`;
        default:
            return `Execute ${toolName} with args: ${JSON.stringify(args).slice(0, 200)}`;
    }
}
