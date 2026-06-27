/**
 * Voice-side tool wrappers.
 *
 * These reuse the EXISTING ai-bots tool layer (`BotTool` shape + the pgvector
 * KB search) so the in-call agent can look things up and take actions mid-call
 * instead of answering purely from its prompt.
 *
 * `buildVoiceTools` resolves a per-call tool set from the hydrated AiBot:
 *   - `search_knowledge_base` — included only when the bot has KB ids.
 *   - `lookup_contact` — CRM contact lookup, always available (org-scoped).
 *
 * Each entry is a `BotTool` bound at run-time to a `BotToolContext` carrying the
 * server-resolved `organizationId` (🔒 never client-supplied). The agent
 * composes these into AI-SDK `CoreTool`s and runs a bounded tool-call loop.
 */

import { searchKnowledgeBaseTool } from '@/lib/ai-bots/tools/search-knowledge-base';
import type { BotTool, BotToolContext } from '@/lib/ai-bots/tools/types';

import { lookupContactTool } from './lookup-contact';

export interface BuildVoiceToolsInput {
  /** KB ids on the hydrated bot — KB tool is included only when non-empty. */
  knowledgeBaseIds?: string[];
  /** Whether to expose the CRM contact lookup tool (default true). */
  enableContactLookup?: boolean;
}

/**
 * Resolve the voice tool set for a call. Returns an empty array when the bot has
 * no KB and contact lookup is disabled — callers treat that as "no tools" and
 * keep the legacy fast path.
 */
export function buildVoiceTools(input: BuildVoiceToolsInput): BotTool[] {
  const tools: BotTool[] = [];

  if (input.knowledgeBaseIds && input.knowledgeBaseIds.length > 0) {
    // The underlying tool is brand/org-scoped via the BotToolContext; the bot's
    // KB ids gate inclusion here (no ids ⇒ no KB tool ⇒ no extra latency).
    tools.push(searchKnowledgeBaseTool as BotTool);
  }

  if (input.enableContactLookup !== false) {
    tools.push(lookupContactTool as BotTool);
  }

  return tools;
}

/** Re-export the context type for the agent's binding layer. */
export type { BotTool, BotToolContext };
