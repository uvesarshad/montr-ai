/**
 * LLM agent that drives the AI side of a voice call.
 *
 * Takes user turns (finalized STT segments) and produces assistant responses
 * via `generateTextWithClient`. When the bot supplies tools (KB search, CRM
 * lookup, …) `respond()` runs a BOUNDED tool-call loop — the AI SDK's own
 * `maxSteps` machinery (capped here for telephony latency) drives
 * model → tool calls → tool results → final spoken reply in one call. With no
 * tools the legacy single-shot fast path is used unchanged (no regression).
 */

import { generateTextWithClient } from '@/ai/client';
import type { Plan, UserProfile } from '@/lib/auth/types';
import type { ApiKeys, RouteHint } from '@/ai/types';
import type { CoreMessage, CoreTool } from 'ai';
import { tool } from 'ai';

import type { BotTool, BotToolContext } from '@/lib/ai-bots/tools/types';

/**
 * Hard ceiling on tool-call rounds per turn. Each round is an extra LLM hop, so
 * for telephony we keep this small — 3 is enough for "search KB → answer" or
 * "lookup contact → answer" without stacking call latency.
 */
const MAX_TOOL_ROUNDS = 3;

export interface VoiceAgentOptions {
  model: string;
  systemPrompt: string;
  userProfile?: UserProfile | null;
  userPlan?: Plan | null;
  userApiKeys?: ApiKeys;
  routeHint?: RouteHint | null;
  temperature?: number;
  /** Max tokens per assistant response (kept short for low-latency speech). */
  maxTokens?: number;
  /**
   * Optional in-call tools (KB search, CRM lookup, …). When present, `respond()`
   * runs a bounded tool-call loop; when absent the fast single-shot path is used.
   * Tools are `BotTool`s reused from the ai-bots layer, bound at run-time to the
   * org-scoped context below.
   */
  tools?: BotTool[];
  /**
   * KB document ids on the hydrated bot. Informational here (the KB tool is
   * already scoped via `organizationId`/`brandId`); kept so callers can decide
   * whether to pass the KB tool at all.
   */
  knowledgeBaseIds?: string[];
  /** 🔒 Org id resolved from the call session — bound into every tool context. */
  organizationId?: string;
  /** Brand id for brand-scoped KB retrieval, when known. */
  brandId?: string | null;
}

export interface VoiceAgent {
  /** Append a user turn and get the assistant reply (already TTS-ready). */
  respond(userText: string): Promise<string>;
  /** Append a system message (used by tool results, call events). */
  appendSystem(text: string): void;
  /** Snapshot the conversation history for persistence. */
  history(): CoreMessage[];
}

/**
 * Wrap `BotTool`s into AI-SDK `CoreTool`s bound to a fixed per-call context.
 * The context (org/brand id) is server-resolved — the model only ever supplies
 * the tool's typed arguments, never the tenancy scope.
 */
function bindTools(tools: BotTool[], ctx: BotToolContext): Record<string, CoreTool> {
  const bound: Record<string, CoreTool> = {};
  for (const t of tools) {
    bound[t.name] = tool({
      description: t.description,
      parameters: t.parameters,
      execute: async (args: unknown) => {
        try {
          return await t.execute(ctx, args);
        } catch (err) {
          // Surface the error to the model so it can recover/apologize rather
          // than failing the whole turn.
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    });
  }
  return bound;
}

export function createVoiceAgent(options: VoiceAgentOptions): VoiceAgent {
  const history: CoreMessage[] = [];

  const hasTools = !!options.tools && options.tools.length > 0;

  // Build the AI-SDK tools once — the binding context is stable for the call.
  // A synthetic conversationId keeps the BotToolContext shape happy; the voice
  // tools (KB search, contact lookup) only read org/brand from it.
  const aiTools: Record<string, CoreTool> | undefined =
    hasTools && options.organizationId
      ? bindTools(options.tools!, {
          brandId: options.brandId ?? null,
          aiBotId: '',
          channel: 'voice',
          conversationId: 'voice-call',
          actor: 'ai_bot',
        })
      : undefined;

  return {
    async respond(userText: string): Promise<string> {
      history.push({ role: 'user', content: userText });

      const reply = await generateTextWithClient({
        model: options.model,
        system: options.systemPrompt,
        messages: history,
        userProfile: options.userProfile ?? null,
        userPlan: options.userPlan ?? null,
        userApiKeys: options.userApiKeys,
        routeHint: options.routeHint ?? null,
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 256,
        // Bounded tool-call loop only when tools are present; otherwise this is
        // exactly the previous single-shot call (tools/maxSteps undefined).
        ...(aiTools ? { tools: aiTools, maxSteps: MAX_TOOL_ROUNDS } : {}),
      });

      history.push({ role: 'assistant', content: reply });
      return reply;
    },

    appendSystem(text: string): void {
      history.push({ role: 'system', content: text });
    },

    history(): CoreMessage[] {
      return history.slice();
    },
  };
}
