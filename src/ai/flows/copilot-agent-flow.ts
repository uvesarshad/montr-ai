import { streamTextWithClient, generateTextWithClient } from '@/ai/client';
// IMPORTANT: Import from tools/index to trigger all tool registrations
import { toolRegistry } from '@/lib/agent/tools';
import { CoreMessage } from 'ai';
import { IMarketingPlan, IMarketingTask } from '@/lib/db/models/marketing-plan.model';
import { dbConnect } from '@/lib/db/connect';
import MarketingPlan from '@/lib/db/models/marketing-plan.model';
import BrandContext, { IBrandContext } from '@/lib/db/models/brand-context.model';
import { findModelByIdLoose } from '@/lib/model-groups';
import { getRouteHint, canUserAccessModel } from '@/lib/model-access';
import { userRepository } from '@/lib/db/repository/user.repository';
import { planRepository } from '@/lib/db/repository/plan.repository';
import { ApiKeys } from '@/ai/types';

import { AISettingsService } from '@/lib/services/ai-settings.service';
import { compactConversation } from '@/lib/agent/compaction-engine';
import {
    routeToAgentWithLLM,
    detectExplicitAgentRequest,
    getAgentToolFilter,
    getSession,
    updateSession,
} from '@/lib/agent/multi-agent';
import { agentMissionRepository } from '@/lib/db/repository/agent-mission.repository';
import { AgentMissionMode } from '@/lib/db/models/agent-mission.model';
import { checkAndIncrement, terminateMission } from '@/lib/agent/mission-budget';
import { checkAgentGate } from '@/lib/agent/plan-gate';

interface ProcessCopilotMessageInput {
    message: string;
    brandId: string;
    missionId?: string;
    history?: CoreMessage[];
    userId: string;
}

/**
 * Build the system prompt dynamically from BrandContext + Marketing Plan.
 */
function buildSystemPrompt(brandContext: IBrandContext | null, roadmapContext: string): string {
    // === SOUL SECTION ===
    const soulSection = brandContext
        ? `You are "${brandContext.agentName}", a proactive AI Agent and strategic marketing assistant.
Personality: ${brandContext.personality}
Tone: ${brandContext.tone}
Communication Style: ${brandContext.languageStyle}
${brandContext.customInstructions ? `Special Instructions: ${brandContext.customInstructions}` : ''}`
        : `You are MontrAI's proactive AI Agent, a fractional Chief Marketing Officer and strategic assistant.`;

    // === CONTEXT SECTION ===
    let contextSection = '';
    if (brandContext) {
        const parts: string[] = [];
        if (brandContext.brandVoice) parts.push(`Brand Voice: ${brandContext.brandVoice}`);
        if (brandContext.targetAudience) parts.push(`Target Audience: ${brandContext.targetAudience}`);
        if (brandContext.industry) parts.push(`Industry: ${brandContext.industry}`);
        if (brandContext.competitors?.length > 0) parts.push(`Key Competitors: ${brandContext.competitors.join(', ')}`);
        if (brandContext.keyMessages?.length > 0) parts.push(`Key Messages: ${brandContext.keyMessages.join('; ')}`);

        if (parts.length > 0) {
            contextSection = `\n\nBrand Context:\n${parts.join('\n')}`;
        }
    }

    // === INSTRUCTIONS ===
    const instructions = `

Instructions:
1. Your goal is to help the user grow their business by executing tasks on their Marketing Roadmap and answering strategic questions.
2. If the user asks what they should do next, refer to their Pending Tasks in the roadmap.
3. Be proactive! If a task involves creating a CRM contact, sending an email, or triggering a workflow, offer to do it for them!
4. You have access to the platform's tools. Use them when appropriate to execute actions on behalf of the user.
5. All actions you execute (creating contacts, scheduling posts, etc.) will appear in the user's GUI — they can view and manage everything you create.
6. Keep your responses concise, action-oriented, and encouraging.

Your Agent Workspace (notes the user can read and edit):
- Keep durable working notes in the workspace via write_workspace_doc — research into Research/, plans into Strategies/, drafts into Drafts/, outcome write-ups into Reports/, reusable know-how into Playbooks/.
- Before relying on remembered facts, list_workspace_docs and read_doc the "Agent Memory" doc; when you learn something durable about the brand (preferences, what worked, what to avoid), update it.
- For multi-day goals, do not idle: schedule future work (create_scheduled_task) or hibernate with sleep_until and continue when you wake.`;

    return `${soulSection}${contextSection}

Context about their current marketing roadmap:
${roadmapContext}${instructions}`;
}

/**
 * Prepare everything needed for one mission turn — model, prompt, tools, budget hooks.
 * Shared between the streaming HTTP path and the worker (non-streaming) path.
 */
async function prepareMissionTurnContext({ message, brandId, missionId, history = [], userId }: ProcessCopilotMessageInput) {
    await dbConnect();

    // Agent plan-gate check (B1-4.5.2)
    const gate = await checkAgentGate({ userId });
    if (!gate.allowed) {
        throw new Error(gate.reason ?? 'Agent features not available on your plan.');
    }

    // Fetch user profile and plan to determine AI route
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let userProfile: any, userPlan: any, userApiKeys: ApiKeys | undefined;
    const user = await userRepository.findById(userId);
    if (user) {
        userApiKeys = user.userApiKeys as ApiKeys | undefined;
        userProfile = user;
        if (user.planId) {
            const plan = await planRepository.findById(user.planId);
            userPlan = plan ? {
                id: plan._id.toString(),
                name: plan.name,
                features: plan.features,
            } : null;
        }
    }

    // Look up preferred model for the 'copilotAgent' task via AISettingsService.
    // An explicit user/system choice wins; otherwise the plan tier's defaultModel
    // applies (super-admin configurable per plan) — never a hardcoded model.
    const aiPreference = await AISettingsService.getPreferredModel(userId, 'copilotAgent');
    const model = aiPreference.source === 'fallback'
        ? gate.defaultModel
        : (aiPreference.modelId || gate.defaultModel);

    const modelDef = findModelByIdLoose(model);
    if (!modelDef) throw new Error(`Model '${model}' not found in model registry.`);

    const access = canUserAccessModel(modelDef, userPlan, userProfile);
    if (!access.allowed) throw new Error(access.reason || 'Model access denied');

    const routeHint = getRouteHint(modelDef, userProfile, access.usingByok) || aiPreference.routeHint;

    // Fetch Brand Context (SOUL.md + TOOLS.md equivalent)
    let brandContext: IBrandContext | null = null;
    if (brandId && brandId.match(/^[0-9a-fA-F]{24}$/)) {
        brandContext = await BrandContext.findOne({ brandId });
    }

    // Fetch the active marketing plan for context
    let plan: IMarketingPlan | null = null;
    if (brandId && brandId.match(/^[0-9a-fA-F]{24}$/)) {
        plan = await MarketingPlan.findOne({ brandId }).lean() as IMarketingPlan | null;
    }

    let roadmapContext = "No active marketing roadmap found. The user should complete the Onboarding flow on the dashboard.";

    if (plan && plan.tasks) {
        roadmapContext = `
The user has an active Marketing Roadmap (Level ${plan.currentLevel}, ${plan.currentXp} XP).
Pending Tasks: 
${plan.tasks.filter((t: IMarketingTask) => t.status !== 'completed').map((t: IMarketingTask) => `- ${t.title} (${t.difficulty}): ${t.description}`).join('\n')}

Completed Tasks:
${plan.tasks.filter((t: IMarketingTask) => t.status === 'completed').map((t: IMarketingTask) => `- ${t.title}`).join('\n')}
`;
    }

    // Build the dynamic system prompt
    let systemPrompt = buildSystemPrompt(brandContext, roadmapContext);

    // Inject recent tool execution history from the mission timeline so both
    // the HTTP and worker paths share the same continuity injection. Includes
    // event IDs so the agent can cite them as evidence when calling completeMission.
    let enrichedHistory: CoreMessage[] = history;
    if (missionId) {
        // Mission goal injection (2026-06-06): trigger-, roadmap-, and
        // wake-driven missions carry their objective in mission.title/summary
        // — without this block the worker's continuation turns had NO idea
        // what the mission was for (the model asked the user to onboard).
        try {
            const missionDoc = await agentMissionRepository.findById(missionId, userId);
            if (missionDoc) {
                systemPrompt += `\n\nCURRENT MISSION:\nTitle: ${missionDoc.title}\nObjective: ${missionDoc.summary}\nMode: ${missionDoc.mode}${missionDoc.mode === 'autonomous' ? ' — work autonomously toward the objective using your tools; call completeMission with cited evidence when done, reportBlocked if stuck, or sleep_until to wait for external results.' : ''}`;
            }
        } catch {
            // Non-fatal — proceed without the mission block.
        }

        try {
            const recentEvents = await agentMissionRepository.listEvents(missionId, userId, 200);
            const toolEvents = recentEvents
                .filter((e) => e.type === 'tool_call' || e.type === 'tool_result')
                .slice(-20);

            if (toolEvents.length > 0) {
                // Recent tool_result events get the full payload (up to ~4KB each) so the
                // model can act on detailed data; older events fall back to a short summary.
                const RECENT_FULL_WINDOW = 5;
                const RECENT_FULL_PER_EVENT = 4_000;
                const OLDER_EXCERPT_LEN = 240;

                // Identify the indices of the last N tool_result events.
                const recentResultIndices = new Set<number>();
                for (let i = toolEvents.length - 1; i >= 0 && recentResultIndices.size < RECENT_FULL_WINDOW; i--) {
                    if (toolEvents[i].type === 'tool_result') recentResultIndices.add(i);
                }

                const toolSummary = toolEvents
                    .map((e, idx) => {
                        const eventId = (e as { _id?: { toString?: () => string } })._id?.toString?.() || '';
                        const meta = (e.metadata as {
                            toolName?: string;
                            toolArgs?: unknown;
                            resultFull?: string;
                            resultSummary?: string;
                            truncated?: boolean;
                        } | undefined) || {};
                        if (e.type === 'tool_call') {
                            const toolArgs = meta.toolArgs;
                            return `[Tool called | eventId=${eventId}: ${meta.toolName}${toolArgs ? ' with ' + JSON.stringify(toolArgs).slice(0, 200) : ''}]`;
                        }
                        const useFull = recentResultIndices.has(idx);
                        const body = useFull
                            ? (meta.resultFull || meta.resultSummary || e.content || '').slice(0, RECENT_FULL_PER_EVENT)
                            : (meta.resultSummary || e.content || '').slice(0, OLDER_EXCERPT_LEN);
                        const truncSuffix = meta.truncated && useFull ? ' …(truncated)' : '';
                        return `[Tool result | eventId=${eventId}: ${meta.toolName} → ${body}${truncSuffix}]`;
                    })
                    .join('\n');

                const injectedContext: CoreMessage = {
                    role: 'system',
                    content: `Recent tool execution history from this mission (for continuity — do not repeat completed actions). Each line shows the mission event ID — cite tool_result eventIds as evidence when calling completeMission:\n${toolSummary}`,
                };
                enrichedHistory = [injectedContext, ...history];
            }
        } catch {
            // Non-fatal — proceed without enrichment.
        }
    }

    const rawMessages: CoreMessage[] = [
        ...enrichedHistory,
        { role: 'user', content: message }
    ];

    // Apply compaction to prevent token overflow in long conversations
    const messages = await compactConversation(rawMessages);

    // Multi-agent routing
    const userRole = userProfile?.role || 'admin';
    const explicitAgent = detectExplicitAgentRequest(message);
    const _session = await getSession(userId, brandId);
    const routeResult = await routeToAgentWithLLM(message, userId, userRole, explicitAgent || undefined);
    const selectedAgent = routeResult.agent;
    const agentToolFilter = getAgentToolFilter(selectedAgent);

    // Fetch mission mode so it can gate HITL and adjust prompt
    let missionMode: AgentMissionMode = 'mixed';
    if (missionId) {
        const mission = await agentMissionRepository.findById(missionId, userId);
        if (mission?.mode) missionMode = mission.mode;
    }

    // Build agent context with brand-specific tool permissions
    const agentContext = {
        userId,
        brandId,
        missionId,
        mode: missionMode,
        userEmail: userProfile?.email || undefined,
        userName: userProfile?.name || undefined,
        enabledTools: agentToolFilter || brandContext?.enabledTools || undefined,
        requireApproval: brandContext?.requireApproval || undefined,
        creditBudget: brandContext?.maxBudgetPerSession || undefined,
        voiceCallPolicy: brandContext?.voiceCallPolicy || undefined,
    };

    const agentTools = toolRegistry.getToolsForAgent(agentContext);
    const toolNames = Object.keys(agentTools);
    console.log(`[Agent] Brand: ${brandId} | Agent: ${selectedAgent.emoji} ${selectedAgent.name} | Mode: ${missionMode} | Tools: ${toolNames.length} (${toolNames.join(', ')})`);
    if (brandContext) {
        console.log(`[Agent] Using brand context: "${brandContext.agentName}" (${brandContext.tone})`);
    }

    // AU6: Only inject marketing roadmap context for marketing-agent or when a brand is set.
    // For all other specialists, replace with a concise mission-mode header.
    const isMarketingContext = selectedAgent.id === 'marketing-agent' || (brandId && brandId.match(/^[0-9a-fA-F]{24}$/));
    const missionModeNote = missionMode === 'autonomous'
        ? `\n\n## Execution mode: AUTONOMOUS
You may execute safe actions directly without asking for permission. The user is not babysitting this mission — drive it to a terminal state.

When you are done, call completeMission with a verification block:
  - goalRestated: one-sentence restatement of the original goal
  - stepsCompleted: a list of concrete steps you actually executed
  - evidence.eventIds: at least one tool_result event ID from this mission's timeline
  - evidence.linkIds: optional, IDs of mission links you created

The system will REJECT completeMission calls that cite IDs not present on this mission, or that omit evidence in autonomous mode. If you receive a verification_failed response, fix the cited IDs and call completeMission again — do not loop calling it without changes.

Use reportBlocked when you genuinely cannot proceed without user input. Do not use it as a substitute for finishing the work.`
        : missionMode === 'approval-first'
        ? '\n\n## Execution mode: APPROVAL-FIRST\nAlways request approval before executing any action that changes data or sends communications.'
        : '';

    const basePrompt = isMarketingContext ? systemPrompt : (brandContext
        ? `You are "${brandContext.agentName}", a proactive AI Agent.\nPersonality: ${brandContext.personality}\nTone: ${brandContext.tone}`
        : `You are MontrAI's proactive AI Agent, a strategic assistant helping the user accomplish their mission.`);

    // Append agent-specific instructions to system prompt.
    // When the router has low confidence, prepend a clarification prompt so the
    // agent asks the user to disambiguate before proceeding.
    const disambigNote = routeResult.needsDisambiguation && routeResult.disambiguationMessage
        ? `\n\n## Routing note\nYou were assigned because the user's intent is ambiguous. Your FIRST response MUST be the following clarification message (verbatim):\n\n"${routeResult.disambiguationMessage}"\n\nDo not execute any tools until the user has clarified.`
        : '';
    const fullSystemPrompt = `${basePrompt}${missionModeNote}${disambigNote}\n\n## Active Specialist: ${selectedAgent.emoji} ${selectedAgent.name}\n${selectedAgent.systemPromptAddition}`;

    // Update session
    await updateSession(userId, brandId, [{ role: 'user', content: message }], selectedAgent.id);

    const onFinish = missionId
        ? async ({ totalTokens }: { totalTokens?: number }) => {
            if (!totalTokens || totalTokens <= 0) return;
            const result = await checkAndIncrement(missionId, 'tokens', totalTokens).catch((error) => {
                console.error('[Agent] Token budget update failed:', error);
                return { ok: true } as const;
            });
            if (!result.ok && result.exceeded) {
                await terminateMission(
                    { _id: missionId, brandId, userId },
                    missionId,
                    result.exceeded,
                    result.message || 'Mission token budget exceeded',
                );
            }
        }
        : undefined;

    return {
        model,
        system: fullSystemPrompt,
        messages,
        userProfile,
        userPlan,
        userApiKeys,
        routeHint,
        tools: agentTools,
        onFinish,
        selectedAgentId: selectedAgent.id,
        missionMode,
    };
}

export async function streamCopilotResponse(input: ProcessCopilotMessageInput) {
    const ctx = await prepareMissionTurnContext(input);
    return streamTextWithClient({
        model: ctx.model,
        system: ctx.system,
        messages: ctx.messages,
        userProfile: ctx.userProfile,
        userPlan: ctx.userPlan,
        userApiKeys: ctx.userApiKeys,
        routeHint: ctx.routeHint,
        maxSteps: 15,
        tools: ctx.tools,
        onFinish: ctx.onFinish,
    });
}

/**
 * Non-streaming variant for the BullMQ worker. Returns the assistant text so the
 * worker can persist it to the mission timeline. Same model, prompt, tools, and
 * budget hooks as the streaming path — just without SSE.
 */
export async function runMissionTurnNonStreaming(input: ProcessCopilotMessageInput): Promise<string> {
    const ctx = await prepareMissionTurnContext(input);
    return generateTextWithClient({
        model: ctx.model,
        system: ctx.system,
        messages: ctx.messages,
        userProfile: ctx.userProfile,
        userPlan: ctx.userPlan,
        userApiKeys: ctx.userApiKeys,
        routeHint: ctx.routeHint,
        maxSteps: 15,
        tools: ctx.tools,
        onFinish: ctx.onFinish,
    });
}

