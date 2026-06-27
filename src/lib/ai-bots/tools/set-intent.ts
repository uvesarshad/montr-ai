/**
 * setIntent — bot stores its classification of the current conversation intent
 * on the per-conversation state. Read by routing rules and analytics.
 */

import { z } from 'zod';

import { aiBotConversationStateRepository } from '@/lib/db/repository/ai-bot-conversation-state.repository';

import type { BotTool } from './types';

const params = z.object({
  intent: z.string().min(1).max(120),
});

export const setIntentTool: BotTool<z.infer<typeof params>, { ok: true } | { error: string }> = {
  name: 'setIntent',
  description:
    "Record the conversation's current intent (e.g. 'pricing-question', 'support-request', 'booking-attempt'). Use whenever the topic of the conversation shifts.",
  parameters: params,
  execute: async (ctx, args) => {
    if (!ctx.stateId) return { error: 'No conversation state available.' };
    try {
      await aiBotConversationStateRepository.setIntent(ctx.stateId, args.intent);
      return { ok: true };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
};
