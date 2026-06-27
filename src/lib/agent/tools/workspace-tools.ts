/**
 * Agent Workspace Tools (Phase 1, 2026-06-05)
 *
 * The agent's notes live in the Docs module where users can read and edit
 * them (see src/lib/agent/workspace.ts). These tools are the agent-facing
 * surface: browse the workspace, read any accessible doc, and write notes
 * into the workspace subfolders. Workspace writes are internal working notes
 * — hitlPolicy 'never'.
 */

import { z } from 'zod';
import { tool } from 'ai';
import { AgentContext } from './types';
import { toolRegistry } from '../tool-registry';
import {
    listWorkspaceDocs,
    writeWorkspaceDoc,
    WORKSPACE_SUBFOLDERS,
} from '@/lib/agent/workspace';
import DocumentModel from '@/lib/db/models/document.model';
import { dbConnect } from '@/lib/db/connect';

// ─── list_workspace_docs ──────────────────────────────────────────────────────

export const listWorkspaceDocsTool = {
    name: 'list_workspace_docs',
    description: 'Browse your Agent Workspace — the brand\'s folder tree (Strategies, Research, Drafts, Reports, Playbooks) plus the pinned Agent Memory doc. Returns doc IDs for read_doc.',
    parameters: z.object({}),
    hitlPolicy: 'never' as const,
    factory: (context: AgentContext) => tool({
        description: 'List the Agent Workspace folder tree and docs.',
        parameters: z.object({}),
        execute: async () => {
            try {
                const ws = await listWorkspaceDocs({
                    userId: context.userId,
                    brandId: context.brandId || context.userId,
                });
                return { success: true, ...ws };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

// ─── read_doc ─────────────────────────────────────────────────────────────────

const readDocParams = z.object({
    docId: z.string().describe('Document ID (from list_workspace_docs or a doc link).'),
});

export const readDocTool = {
    name: 'read_doc',
    description: 'Read a document\'s full content — workspace notes, the Agent Memory doc, or any doc the user owns. Always read the Agent Memory doc before relying on remembered facts.',
    parameters: readDocParams,
    hitlPolicy: 'never' as const,
    factory: (context: AgentContext) => tool({
        description: 'Read a document by ID.',
        parameters: readDocParams,
        execute: async (args) => {
            try {
                await dbConnect();
                const doc = await DocumentModel.findOne({
                    _id: args.docId,
                    $or: [
                        { userId: context.userId },
                        { },
                    ],
                }).select('_id title content folderId updatedAt').exec();

                if (!doc) return { success: false, error: 'Document not found or not accessible.' };

                const MAX_CHARS = 30_000;
                const content = doc.content ?? '';
                return {
                    success: true,
                    docId: doc._id.toString(),
                    title: doc.title,
                    content: content.length > MAX_CHARS ? `${content.slice(0, MAX_CHARS)}\n…[truncated]` : content,
                    truncated: content.length > MAX_CHARS,
                    updatedAt: (doc as { updatedAt?: Date }).updatedAt?.toISOString(),
                };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

// ─── write_workspace_doc ──────────────────────────────────────────────────────

const writeWorkspaceDocParams = z.object({
    folder: z.enum(WORKSPACE_SUBFOLDERS).describe('Workspace subfolder to write into.'),
    title: z.string().min(1).max(200).describe('Document title.'),
    content: z.string().min(1).describe('Full document body (HTML or markdown).'),
    docId: z.string().optional().describe('Update this existing doc instead of creating a new one (full replacement — read_doc first).'),
});

export const writeWorkspaceDocTool = {
    name: 'write_workspace_doc',
    description: 'Write a note into your Agent Workspace (Strategies, Research, Drafts, Reports, or Playbooks). Use for research findings, working plans, draft content, and reports — the user can read and edit everything you write here. To update the pinned Agent Memory doc, pass its docId with the new full content.',
    parameters: writeWorkspaceDocParams,
    hitlPolicy: 'never' as const,
    factory: (context: AgentContext) => tool({
        description: 'Create or update a workspace document.',
        parameters: writeWorkspaceDocParams,
        execute: async (args) => {
            try {
                const result = await writeWorkspaceDoc({
                    userId: context.userId,
                    brandId: context.brandId || context.userId,
                    folder: args.folder,
                    title: args.title,
                    content: args.content,
                    docId: args.docId,
                });
                return {
                    success: true,
                    docId: result.docId,
                    created: result.created,
                    message: `${result.created ? 'Created' : 'Updated'} "${args.title}" in ${args.folder}/.`,
                    deepLink: `/docs/${result.docId}`,
                };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

toolRegistry.register(listWorkspaceDocsTool);
toolRegistry.register(readDocTool);
toolRegistry.register(writeWorkspaceDocTool);
