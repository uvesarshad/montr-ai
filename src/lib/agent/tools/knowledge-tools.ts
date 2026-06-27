import { z } from 'zod';
import { tool } from 'ai';
import { AgentContext } from './types';
import { toolRegistry } from '../tool-registry';
import { knowledgeBaseService } from '@/lib/inbox/knowledge-base.service';
import { documentRepository } from '@/lib/db/repository/document.repository';

export const searchKnowledgeBaseTool = {
    name: 'searchKnowledgeBase',
    description: 'Search the organization\'s Knowledge Base (which includes all their Docs) for semantic information. Use this if you need specific facts or guides related to the business.',
    parameters: z.object({
        query: z.string().describe("A descriptive, natural language sentence detailing what information you are looking for.")
    }),
    factory: (context: AgentContext) => tool({
        description: 'Search the knowledge base for context.',
        parameters: z.object({ query: z.string() }),
        execute: async (args) => {
            try {
                console.log(`[Agent Tool - KB] Agent ${context.userId} searching KB for: ${args.query}`);
                const kbContext = await knowledgeBaseService.getContext({
                    brandId: context.brandId,
                    query: args.query,
                    maxTokens: 1500 // Don't overwhelm the prompt
                });

                if (!kbContext || kbContext.trim() === '') {
                    return { success: true, result: "No relevant documents found in the Knowledge Base." };
                }

                return {
                    success: true,
                    result: kbContext
                };

            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to search Knowledge Base' };
            }
        }
    })
};

// ─── create_doc ───────────────────────────────────────────────────────────────
// NOTE: these call documentRepository directly — agent tools run server-side
// (worker + route handlers) where a relative fetch('/api/...') has no base URL
// and no session cookie.

const createDocParams = z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1).describe('Document body (markdown or HTML).'),
});

export const createDocTool = {
    name: 'create_doc',
    description: 'Create a new document in Docs. Suitable for SOPs, briefs, reports, and long-form content.',
    parameters: createDocParams,
    factory: (context: AgentContext) => tool({
        description: 'Create a new Docs document.',
        parameters: createDocParams,
        execute: async (args) => {
            try {
                const doc = await documentRepository.create({
                    userId: context.userId,
                    title: args.title,
                    content: args.body,
                });
                return { success: true, docId: doc._id.toString(), title: args.title };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

// ─── update_doc ───────────────────────────────────────────────────────────────

const updateDocParams = z.object({
    docId: z.string().describe('Document ID to update.'),
    body: z.string().describe('New document body (full replacement).'),
    title: z.string().optional().describe('New title (optional).'),
});

export const updateDocTool = {
    name: 'update_doc',
    description: 'Update the body of an existing Docs document.',
    parameters: updateDocParams,
    factory: (context: AgentContext) => tool({
        description: 'Update an existing Docs document.',
        parameters: updateDocParams,
        execute: async (args) => {
            try {
                const patch: { content: string; title?: string } = { content: args.body };
                if (args.title) patch.title = args.title;
                const updated = await documentRepository.update(args.docId, context.userId, patch);
                if (!updated) return { success: false, error: 'Document not found or not owned by this user.' };
                return { success: true, docId: args.docId };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

toolRegistry.register(searchKnowledgeBaseTool);
toolRegistry.register(createDocTool);
toolRegistry.register(updateDocTool);
