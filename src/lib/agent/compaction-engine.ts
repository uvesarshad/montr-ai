/**
 * Compaction Engine v2 (Phase 2, 2026-06-05)
 *
 * Prevents token overflow in long Agent conversations. Hermes-style 4-phase
 * compression, adapted:
 *
 *   1. PRUNE      — oversized tool outputs / blobs in the old section become
 *                   placeholders (no model call).
 *   2. BOUNDARIES — protect the head (first message) and a verbatim tail;
 *                   never split an assistant→tool message pair.
 *   3. SUMMARIZE  — the middle is summarized via the AI client (cheap fast
 *                   model). A previous summary is UPDATED, not regenerated
 *                   from scratch, so context accumulates across compactions.
 *   4. REASSEMBLE — [head, running summary, …verbatim tail].
 *
 * Trigger is token-estimated (chars/4 heuristic — no tokenizer dependency),
 * with the old 20-message count as a secondary trip-wire. Full history is
 * always preserved in the DB for audit/display; this only shapes the prompt.
 */

import { CoreMessage } from 'ai';

/** Approximate prompt budget for conversation history, in tokens. */
const TOKEN_BUDGET = 48_000;
/** Secondary trigger: long message lists compact even when under budget. */
const COMPACTION_THRESHOLD = 20;
/** Verbatim tail preserved on every compaction. */
const KEEP_RECENT = 8;
/** Old-section contents longer than this get pruned to a placeholder. */
const PRUNE_CHAR_LIMIT = 600;

const SUMMARY_MARKER = '[CONVERSATION SUMMARY — earlier messages summarized for context]';

/** chars/4 — good enough for budgeting without a tokenizer dependency. */
export function estimateTokens(messages: CoreMessage[]): number {
    let chars = 0;
    for (const m of messages) {
        chars += typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length;
    }
    return Math.ceil(chars / 4);
}

/**
 * Compact a conversation history. Returns the message array to send to the
 * LLM. Short conversations are returned as-is.
 */
export async function compactConversation(
    messages: CoreMessage[],
    opts: { tokenBudget?: number } = {},
): Promise<CoreMessage[]> {
    const budget = opts.tokenBudget ?? TOKEN_BUDGET;
    if (messages.length <= COMPACTION_THRESHOLD && estimateTokens(messages) <= budget) {
        return messages;
    }

    // ── Phase 2 first (boundaries) so pruning never touches the tail ─────────
    const tailStart = findSafeTailStart(messages, KEEP_RECENT);
    const head = messages.length > 0 ? [messages[0]] : [];
    let middle = messages.slice(head.length, tailStart);
    const tail = messages.slice(tailStart);

    if (middle.length === 0) return messages;

    // Extract any previous running summary from the middle so it can be updated.
    let previousSummary = '';
    middle = middle.filter((m) => {
        const text = typeof m.content === 'string' ? m.content : '';
        if (text.startsWith(SUMMARY_MARKER)) {
            previousSummary = text.slice(SUMMARY_MARKER.length).trim();
            return false;
        }
        return true;
    });

    // ── Phase 1: prune oversized contents in the middle ─────────────────────
    const pruned = middle.map(pruneMessage);

    // ── Phase 3: summarize (update the running summary) ─────────────────────
    const summary = await summarizeMessages(pruned, previousSummary);

    // ── Phase 4: reassemble ──────────────────────────────────────────────────
    return [
        ...head,
        {
            role: 'assistant' as const,
            content: `${SUMMARY_MARKER}\n\n${summary}`,
        },
        ...tail,
    ];
}

/**
 * Find the index where the verbatim tail starts, walking back `keep` messages
 * but never starting the tail on a 'tool' message (its assistant tool-call
 * partner must stay attached).
 */
function findSafeTailStart(messages: CoreMessage[], keep: number): number {
    let start = Math.max(1, messages.length - keep);
    while (start > 1 && messages[start]?.role === 'tool') {
        start--;
    }
    return start;
}

/** Replace oversized message contents with a short placeholder. */
function pruneMessage(message: CoreMessage): CoreMessage {
    const content = typeof message.content === 'string'
        ? message.content
        : JSON.stringify(message.content);
    if (content.length <= PRUNE_CHAR_LIMIT) return message;

    const head = content.slice(0, 200);
    return {
        ...message,
        content: `${head}… [pruned: ${content.length - 200} chars of ${message.role} output omitted]`,
    } as CoreMessage;
}

/**
 * Summarize messages via the AI client (architecture rule: never call
 * provider SDKs/REST directly). Updates `previousSummary` when present.
 */
async function summarizeMessages(messages: CoreMessage[], previousSummary: string): Promise<string> {
    const transcript = messages
        .map((m) => {
            const role = m.role.toUpperCase();
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            return `${role}: ${content.slice(0, 1_500)}`;
        })
        .join('\n\n');

    const prompt = previousSummary
        ? `You maintain a running summary of a conversation between a user and an AI business agent.

EXISTING SUMMARY (keep everything still relevant, fold in the new transcript):
${previousSummary}

NEW TRANSCRIPT TO FOLD IN:
${transcript}

Write the UPDATED summary (max 300 words). Preserve: key decisions, actions taken (tool calls, records created, content published), facts about the brand/business, open tasks, and anything the agent promised to do. Drop chit-chat.`
        : `Summarize this conversation between a user and an AI business agent into a concise brief (max 250 words). Focus on:
1. Key decisions made
2. Actions taken (tool calls, contacts created, content published, schedules set)
3. Important context about the brand/business
4. Pending tasks or unfinished discussions

Transcript:
${transcript}`;

    try {
        const { generateTextWithClient } = await import('@/ai/client');
        // Model is task-routed (Phase 3, G10) via the 'agentCompaction' AI
        // task — admin-configurable; defaults to a cheap fast model.
        const { AISettingsService } = await import('@/lib/services/ai-settings.service');
        const pref = await AISettingsService.getPreferredModel(undefined, 'agentCompaction');
        const summary = await generateTextWithClient({
            model: pref.modelId,
            system: 'You are a precise conversation summarizer for an AI business agent.',
            messages: [{ role: 'user', content: prompt }],
            maxTokens: 450,
            temperature: 0.2,
            routeHint: pref.routeHint,
        });
        const text = typeof summary === 'string' ? summary.trim() : '';
        if (text) return text;
    } catch (error) {
        console.error('[Compaction] Summary generation failed:', error);
    }

    return buildFallbackSummary(messages, previousSummary);
}

/** Fallback when the summarizer is unavailable: keep the old summary + recent user asks. */
function buildFallbackSummary(messages: CoreMessage[], previousSummary: string): string {
    const keyMessages = messages
        .filter((m) => m.role === 'user')
        .map((m) => (typeof m.content === 'string' ? m.content : '').slice(0, 100))
        .filter(Boolean)
        .slice(-5);

    const recent = `Recent topics: ${keyMessages.join('; ')}`;
    return previousSummary ? `${previousSummary}\n\n${recent}` : recent;
}
