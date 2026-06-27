/**
 * searchKnowledgeBase — wraps the existing KB context service so the bot
 * can pull facts/FAQs into its reply. Brand-scoped via context.brandId.
 */

import { z } from 'zod';

import { knowledgeBaseService } from '@/lib/inbox/knowledge-base.service';

import type { BotTool } from './types';

const params = z.object({
  query: z.string().min(1).describe('Natural-language description of the information needed.'),
});

export const searchKnowledgeBaseTool: BotTool<z.infer<typeof params>, string> = {
  name: 'searchKnowledgeBase',
  description:
    "Search the organization's knowledge base (Docs, FAQs, indexed content) for relevant context before answering. Use whenever the answer depends on company-specific facts you do not already know.",
  parameters: params,
  execute: async (ctx, args) => {
    try {
      const result = await knowledgeBaseService.getContext({
        brandId: ctx.brandId ?? undefined,
        query: args.query,
        maxTokens: 1500,
      });
      if (!result || result.trim() === '') {
        return 'No relevant documents found.';
      }
      return result;
    } catch (err) {
      return `Knowledge base lookup failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};
