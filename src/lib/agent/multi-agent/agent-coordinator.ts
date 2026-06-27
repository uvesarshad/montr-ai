/**
 * Agent Coordinator
 *
 * Routes user messages to the best specialist agent.
 * Primary path: LLM intent classification using the plan's routerModel.
 * Fallback: keyword-length scoring (synchronous, no external call).
 */

import { AGENT_DEFINITIONS, AgentDefinition, getAccessibleAgents } from './agent-definitions';
import { getEffectivePlanFeatures } from '@/lib/plan-enforcement';
import { generateTextWithClient } from '@/ai/client';

// ─── Result types ─────────────────────────────────────────────────────────────

export interface AgentRouteResult {
    agent: AgentDefinition;
    confidence: number;
    /** True when confidence < 0.6 — caller should ask the user to clarify. */
    needsDisambiguation?: boolean;
    /** Pre-built message to surface to the user when needsDisambiguation is true. */
    disambiguationMessage?: string;
}

// ─── LLM router (primary) ─────────────────────────────────────────────────────

/**
 * Build a compact agent catalog for the LLM classification prompt.
 * This string is included in the system prompt and will be cached by Anthropic
 * once it exceeds 1024 tokens (the auto-caching threshold).
 */
function buildAgentCatalog(agents: AgentDefinition[]): string {
    return agents
        .map(a => `- id="${a.id}" name="${a.name}": ${a.description}`)
        .join('\n');
}

const DISAMBIGUATION_THRESHOLD = 0.6;

/**
 * Classify the user message via LLM and return the best agent + confidence.
 * Falls back to keyword scoring if the LLM call fails or returns unparseable output.
 *
 * IMPORTANT: routerModel is read from plan features — never hardcoded.
 */
export async function routeToAgentWithLLM(
    message: string,
    userId: string,
    userRole: string = 'user',
    preferredAgentId?: string,
): Promise<AgentRouteResult> {
    // Explicit agent request wins immediately.
    if (preferredAgentId) {
        const preferred = AGENT_DEFINITIONS.find(a => a.id === preferredAgentId);
        if (preferred) return { agent: preferred, confidence: 1.0 };
    }

    const accessible = getAccessibleAgents(userRole);

    try {
        // Get router model from plan features — never hardcoded.
        const features = await getEffectivePlanFeatures(userId);
        const routerModel: string =
            (features.agent as { routerModel?: string } | undefined)?.routerModel
            ?? 'claude-haiku-4-5-20251001';

        const catalog = buildAgentCatalog(accessible.filter(a => a.id !== 'general-agent'));

        const systemPrompt = `You are an intent-classification router for a multi-agent marketing platform.
Given a user message, pick the single best specialist agent from the catalog below.
Return ONLY a valid JSON object — no markdown, no prose.

Agent catalog:
${catalog}

Rules:
1. Pick the agent whose domain best matches the user's request.
2. Set "confidence" between 0.0 and 1.0.
3. If no specialist fits well, use "general-agent" with confidence 0.5.
4. If the message is genuinely ambiguous between two specialists, set confidence below 0.6.

Response schema (strict JSON):
{"agentId":"<id>","confidence":<0-1>,"reasoning":"<one sentence>"}`;

        const raw = await generateTextWithClient({
            model: routerModel,
            system: systemPrompt,
            messages: [{ role: 'user', content: message }],
            maxTokens: 120,
            temperature: 0,
        });

        // Extract JSON from response (handles extra whitespace / fenced blocks).
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON in router response');

        const parsed = JSON.parse(jsonMatch[0]) as {
            agentId: string;
            confidence: number;
            reasoning?: string;
        };

        const matchedAgent =
            accessible.find(a => a.id === parsed.agentId) ||
            accessible.find(a => a.id === 'general-agent') ||
            accessible[accessible.length - 1];

        if (parsed.confidence < DISAMBIGUATION_THRESHOLD) {
            const candidates = accessible
                .filter(a => a.id !== 'general-agent')
                .map(a => `**${a.name}** (${a.description})`)
                .join('\n');
            return {
                agent: matchedAgent,
                confidence: parsed.confidence,
                needsDisambiguation: true,
                disambiguationMessage:
                    `I'm not sure which area this falls under. Could you clarify your request? Here are the available specialists:\n\n${candidates}`,
            };
        }

        return { agent: matchedAgent, confidence: parsed.confidence };
    } catch {
        // LLM unavailable or parse error — fall back to keyword scoring.
        const fallback = keywordRoute(message, accessible);
        return { agent: fallback, confidence: 0 };
    }
}

// ─── Keyword router (fallback / synchronous) ──────────────────────────────────

/**
 * Route by keyword-length scoring. Kept as a synchronous export so it can be
 * used as a fast fallback or in contexts where async isn't practical.
 */
export function routeToAgent(
    message: string,
    userRole: string = 'user',
    preferredAgentId?: string,
): AgentDefinition {
    if (preferredAgentId) {
        const preferred = AGENT_DEFINITIONS.find(a => a.id === preferredAgentId);
        if (preferred) return preferred;
    }
    return keywordRoute(message, getAccessibleAgents(userRole));
}

function keywordRoute(message: string, accessible: AgentDefinition[]): AgentDefinition {
    const lowerMessage = message.toLowerCase();

    const scores = accessible
        .filter(a => a.id !== 'general-agent')
        .map(agent => {
            let score = 0;
            for (const keyword of agent.intentKeywords) {
                if (lowerMessage.includes(keyword.toLowerCase())) {
                    score += keyword.length; // Longer keywords = more specific weight
                }
            }
            return { agent, score };
        });

    scores.sort((a, b) => b.score - a.score);

    if (scores.length > 0 && scores[0].score > 0) {
        return scores[0].agent;
    }

    return accessible.find(a => a.id === 'general-agent') || accessible[accessible.length - 1];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Detect if a message is requesting a specific agent by mention.
 * e.g. "@crm ..." or "ask the inbox agent to..."
 */
export function detectExplicitAgentRequest(message: string): string | null {
    const patterns: Record<string, string[]> = {
        'crm-agent': ['@crm', 'crm agent', 'ask crm', 'sales agent'],
        'social-agent': ['@social', 'social agent', 'content agent', 'ask social'],
        'knowledge-agent': ['@knowledge', 'knowledge agent', 'ask knowledge', 'memory agent'],
        'recruitment-agent': ['@recruit', 'recruitment agent', 'hiring agent', 'ask recruit'],
        'content-factory-agent': ['@content-factory', 'content factory', 'bulk content', 'ask content factory'],
        'inbox-agent': ['@inbox', 'inbox agent', 'ask inbox'],
        'strategy-agent': ['@strategy', 'strategy agent', 'ask strategy'],
        'ops-agent': ['@ops', 'ops agent', 'ask ops', 'operations agent', '@automation', 'automation agent', 'ask automation', 'workflow agent'],
        'voice-agent': ['@voice', 'voice agent', 'ask voice', 'call agent', 'phone agent'],
    };

    const lower = message.toLowerCase();
    for (const [agentId, triggers] of Object.entries(patterns)) {
        if (triggers.some(t => lower.includes(t))) {
            return agentId;
        }
    }

    return null;
}

/**
 * Build agent-specific tool filter.
 * Returns the tool names the agent can use (undefined = all tools).
 */
export function getAgentToolFilter(agent: AgentDefinition): string[] | undefined {
    if (agent.tools.includes('*')) {
        return undefined;
    }
    return agent.tools;
}
