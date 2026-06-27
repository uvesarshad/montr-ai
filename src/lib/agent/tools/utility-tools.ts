import { z } from 'zod';
import { tool } from 'ai';
import { AgentContext } from './types';
import { toolRegistry } from '../tool-registry';
import { knowledgeBaseService } from '@/lib/inbox/knowledge-base.service';
import { Types } from 'mongoose';

/**
 * Get the current date/time (utility for scheduling and context)
 */
export const getCurrentDateTool = {
    name: 'getCurrentDate',
    description: 'Get the current date and time. Use this before scheduling posts, setting deadlines, or when the user asks about today\'s date.',
    parameters: z.object({}),
    factory: (_context: AgentContext) => tool({
        description: 'Get the current date and time.',
        parameters: z.object({}),
        execute: async () => {
            const now = new Date();
            return {
                success: true,
                date: now.toISOString(),
                formatted: now.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                }),
                time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                timestamp: now.getTime(),
            };
        }
    })
};

/**
 * Add content to the brand knowledge base
 */
export const addToKnowledgeBaseTool = {
    name: 'addToKnowledgeBase',
    description: 'Save information to the Brand Memory / Knowledge Base for future reference. Use this when a user shares important brand info, guidelines, or facts that should be remembered.',
    parameters: z.object({
        title: z.string().describe("A short title for this knowledge entry."),
        content: z.string().describe("The full content to save."),
        type: z.enum(['text', 'faq', 'url']).optional().describe("Type of content (default: text)."),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Save information to the Knowledge Base.',
        parameters: z.object({
            title: z.string(),
            content: z.string(),
            type: z.enum(['text', 'faq', 'url']).optional(),
        }),
        execute: async (args) => {
            try {
                console.log(`[Agent Tool - addToKB] Saving to KB: "${args.title}"`);

                const entry = await knowledgeBaseService.indexDocument({
                    brandId: context.brandId,
                    name: args.title,
                    content: args.content,
                    type: args.type || 'text',
                    sourceModule: 'copilot',
                    metadata: { addedBy: 'agent', userId: context.userId },
                    createdById: new Types.ObjectId(context.userId),
                });

                return {
                    success: true,
                    message: `"${args.title}" has been saved to Brand Memory. The AI will reference this in future conversations.`,
                    entryId: (entry as { _id?: { toString(): string } })._id?.toString?.(),
                    deepLink: '/settings?tab=brand-memory',
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to save to knowledge base' };
            }
        }
    })
};

toolRegistry.register(getCurrentDateTool);
toolRegistry.register(addToKnowledgeBaseTool);
