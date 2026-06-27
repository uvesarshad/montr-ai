/**
 * Tool layer types for AI bot runtime.
 *
 * A tool exposes a Zod parameters schema + an execute function that runs with
 * the bot's per-turn context. The runtime composes these into AI-SDK `CoreTool`
 * shapes for the LLM call.
 */

import { z } from 'zod';

import type { AiBotChannel } from '@/lib/db/models/ai-bot.model';

export interface BotToolContext {
  brandId?: string | null;
  aiBotId: string;
  channel: AiBotChannel;
  conversationId: string;
  contactId?: string | null;
  stateId?: string;
  actor: 'ai_bot';
}

export interface BotTool<TArgs = unknown, TResult = unknown> {
  name: string;
  description: string;
  parameters: z.ZodType<TArgs>;
  execute: (ctx: BotToolContext, args: TArgs) => Promise<TResult>;
}

// Use `any` here so heterogeneous tools (with different TArgs / TResult) can
// coexist in a single registry / array. The runtime invokes them with `unknown`
// args anyway; per-tool TArgs is only ergonomic for the tool author.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BotToolRegistry = Record<string, BotTool<any, any>>;
