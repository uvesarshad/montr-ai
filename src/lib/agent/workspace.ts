/**
 * Agent Workspace (Phase 1, 2026-06-05 — decision D2)
 *
 * The agent's filesystem, built on the existing Docs module so users can open,
 * read, and edit everything the agent writes (the Hermes "everything in notes"
 * idea, multi-tenant). One system-created, brand-scoped folder tree:
 *
 *   Agent Workspace — <brand>/
 *     Strategies/  Research/  Drafts/  Reports/  Playbooks/
 *     + pinned "Agent Memory" doc (curated long-form memory; the KV
 *       counterpart lives in AgentMemory via the memory tools)
 *
 * Folders/docs are identified by referenceType ('agent_workspace' /
 * 'agent_workspace_memory') + referenceId (brandId) — names are display-only
 * and safe for users to rename. Provisioning is idempotent.
 */

import FolderModel from '@/lib/db/models/folder.model';
import DocumentModel from '@/lib/db/models/document.model';
import { dbConnect } from '@/lib/db/connect';
import { getStarterPlaybooksForIndustry } from '@/lib/agent/playbook-starters';

export const WORKSPACE_SUBFOLDERS = ['Strategies', 'Research', 'Drafts', 'Reports', 'Playbooks'] as const;
export type WorkspaceSubfolder = typeof WORKSPACE_SUBFOLDERS[number];

export const WORKSPACE_REF_TYPE = 'agent_workspace';
export const WORKSPACE_MEMORY_REF_TYPE = 'agent_workspace_memory';

export interface WorkspaceHandle {
    rootFolderId: string;
    folders: Record<WorkspaceSubfolder, string>;
    memoryDocId: string;
}

const MEMORY_DOC_SEED = `<h1>Agent Memory</h1>
<p>This document is the agent's curated long-term memory for this brand. The agent updates it with durable facts, preferences, and lessons learned. You can edit it directly — the agent reads it back.</p>
<h2>Brand facts</h2>
<p><em>(empty — the agent will fill this in as it learns)</em></p>
<h2>What worked</h2>
<p><em>(empty)</em></p>
<h2>What to avoid</h2>
<p><em>(empty)</em></p>`;

/**
 * Idempotently provision the workspace tree for a brand and return its IDs.
 */
export async function ensureAgentWorkspace(params: {
    userId: string;
    brandId: string;
    brandName?: string;
}): Promise<WorkspaceHandle> {
    await dbConnect();

    const { userId, brandId } = params;

    // Root folder — keyed by referenceType+referenceId, not by name.
    let root = await FolderModel.findOne({
        referenceType: WORKSPACE_REF_TYPE,
        referenceId: brandId,
        parentId: null,
    }).exec();

    if (!root) {
        root = await FolderModel.create({
            userId,
            name: params.brandName ? `Agent Workspace — ${params.brandName}` : 'Agent Workspace',
            parentId: null,
            referenceType: WORKSPACE_REF_TYPE,
            referenceId: brandId,
        });
    }

    const rootId = root._id.toString();

    // Subfolders — keyed by referenceType+referenceId('<brandId>:<name>').
    const folders = {} as Record<WorkspaceSubfolder, string>;
    let playbooksFolderCreated = false;
    for (const name of WORKSPACE_SUBFOLDERS) {
        const refId = `${brandId}:${name}`;
        let sub = await FolderModel.findOne({
            referenceType: WORKSPACE_REF_TYPE,
            referenceId: refId
        }).exec();
        if (!sub) {
            sub = await FolderModel.create({
                userId,
                name,
                parentId: rootId,
                referenceType: WORKSPACE_REF_TYPE,
                referenceId: refId,
            });
            if (name === 'Playbooks') playbooksFolderCreated = true;
        }
        folders[name] = sub._id.toString();
    }

    // Seed vertical starter playbooks on first provisioning (Phase 3, G9) —
    // matched against the brand's industry; the universal loop always ships.
    if (playbooksFolderCreated) {
        try {
            const BrandContext = (await import('@/lib/db/models/brand-context.model')).default;
            const ctx = await BrandContext.findOne({ brandId }).select('industry').lean() as { industry?: string } | null;
            const starters = getStarterPlaybooksForIndustry(ctx?.industry);
            for (const starter of starters) {
                await DocumentModel.create({
                    userId,
                    title: starter.title,
                    content: starter.content,
                    folderId: folders.Playbooks,
                    isPublished: false,
                });
            }
        } catch (error) {
            console.error('[Workspace] Failed to seed starter playbooks:', error);
        }
    }

    // Pinned memory doc.
    let memoryDoc = await DocumentModel.findOne({
        referenceType: WORKSPACE_MEMORY_REF_TYPE,
        referenceId: brandId
    }).exec();

    if (!memoryDoc) {
        memoryDoc = await DocumentModel.create({
            userId,
            title: 'Agent Memory',
            content: MEMORY_DOC_SEED,
            folderId: rootId,
            referenceType: WORKSPACE_MEMORY_REF_TYPE,
            referenceId: brandId,
            isPublished: false,
        });
    }

    return { rootFolderId: rootId, folders, memoryDocId: memoryDoc._id.toString() };
}

/**
 * Create or replace a doc in a workspace subfolder. Returns the doc id.
 */
export async function writeWorkspaceDoc(params: {
    userId: string;
    brandId: string;
    folder: WorkspaceSubfolder;
    title: string;
    content: string;
    /** Update this doc instead of creating a new one. */
    docId?: string;
}): Promise<{ docId: string; created: boolean }> {
    await dbConnect();

    const ws = await ensureAgentWorkspace(params);

    if (params.docId) {
        const updated = await DocumentModel.findOneAndUpdate(
            {
                _id: params.docId,
                $or: [{ userId: params.userId }, { }],
            },
            { $set: { title: params.title, content: params.content } },
            { new: true },
        ).exec();
        if (!updated) throw new Error('Workspace doc not found or not accessible.');
        return { docId: params.docId, created: false };
    }

    const doc = await DocumentModel.create({
        userId: params.userId,
        title: params.title,
        content: params.content,
        folderId: ws.folders[params.folder],
        isPublished: false,
    });

    return { docId: doc._id.toString(), created: true };
}

/**
 * List the workspace tree: subfolders with their docs (id, title, updatedAt).
 */
export async function listWorkspaceDocs(params: {
    userId: string;
    brandId: string;
}): Promise<{
    rootFolderId: string;
    memoryDocId: string;
    folders: { name: WorkspaceSubfolder; folderId: string; docs: { id: string; title: string; updatedAt?: string }[] }[];
}> {
    await dbConnect();

    const ws = await ensureAgentWorkspace(params);
    const folderIds = Object.values(ws.folders);

    const docs = await DocumentModel.find({
        folderId: { $in: [...folderIds, ws.rootFolderId] },
    }).select('_id title folderId updatedAt').sort({ updatedAt: -1 }).limit(200).exec();

    const byFolder = new Map<string, { id: string; title: string; updatedAt?: string }[]>();
    for (const doc of docs) {
        const fid = doc.folderId ?? '';
        if (!byFolder.has(fid)) byFolder.set(fid, []);
        byFolder.get(fid)!.push({
            id: doc._id.toString(),
            title: doc.title,
            updatedAt: (doc as { updatedAt?: Date }).updatedAt?.toISOString(),
        });
    }

    return {
        rootFolderId: ws.rootFolderId,
        memoryDocId: ws.memoryDocId,
        folders: WORKSPACE_SUBFOLDERS.map((name) => ({
            name,
            folderId: ws.folders[name],
            docs: byFolder.get(ws.folders[name]) ?? [],
        })),
    };
}

/**
 * Concatenate the brand's playbooks (Playbooks/ docs, newest first) into a
 * plain-text block for prompt grounding (Phase 3, G9 — the strategy generator
 * consumes these). HTML is stripped; budget-capped.
 */
export async function getPlaybookContext(params: {
    userId: string;
    brandId: string;
    maxChars?: number;
    maxDocs?: number;
}): Promise<string> {
    const maxChars = params.maxChars ?? 6_000;
    const maxDocs = params.maxDocs ?? 4;

    try {
        const ws = await ensureAgentWorkspace(params);
        const docs = await DocumentModel.find({ folderId: ws.folders.Playbooks })
            .select('title content updatedAt')
            .sort({ updatedAt: -1 })
            .limit(maxDocs)
            .exec();

        if (!docs.length) return '';

        const blocks: string[] = [];
        let used = 0;
        for (const doc of docs) {
            const text = stripHtml(doc.content ?? '');
            const block = `### ${doc.title}\n${text}`;
            if (used + block.length > maxChars) {
                const remaining = maxChars - used;
                if (remaining > 400) blocks.push(block.slice(0, remaining));
                break;
            }
            blocks.push(block);
            used += block.length;
        }

        return blocks.join('\n\n');
    } catch (error) {
        console.error('[Workspace] getPlaybookContext failed:', error);
        return '';
    }
}

function stripHtml(html: string): string {
    return html
        .replace(/<\/(p|li|h[1-6]|div|br)>/gi, '\n')
        .replace(/<li>/gi, '- ')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Fire-and-forget mission report into Reports/ — called on mission completion.
 */
export async function writeMissionReport(params: {
    userId: string;
    brandId: string;
    missionId: string;
    missionTitle: string;
    summary: string;
    outcome: 'completed' | 'blocked';
    details?: string;
}): Promise<void> {
    try {
        const stamp = new Date().toISOString().slice(0, 10);
        const content = `<h1>${escapeHtml(params.missionTitle)}</h1>
<p><strong>Outcome:</strong> ${params.outcome} · <strong>Date:</strong> ${stamp}</p>
<h2>Summary</h2>
<p>${escapeHtml(params.summary)}</p>
${params.details ? `<h2>Details</h2><p>${escapeHtml(params.details)}</p>` : ''}
<p><em>Written automatically by the agent. Mission: <a href="/agent/missions/${params.missionId}">${params.missionId}</a></em></p>`;

        await writeWorkspaceDoc({
            userId: params.userId,
            brandId: params.brandId,
            folder: 'Reports',
            title: `${stamp} — ${params.missionTitle}`,
            content,
        });

        // Phase 3 (G9b): index the outcome into the knowledge base so future
        // missions can semantically recall "what did we try and what worked"
        // via searchKnowledgeBase.
        try {
            const { Types } = await import('mongoose');
            if (Types.ObjectId.isValid(params.userId) && Types.ObjectId.isValid(params.userId)) {
                const { knowledgeBaseService } = await import('@/lib/inbox/knowledge-base.service');
                await knowledgeBaseService.indexDocument({
                    brandId: params.brandId,
                    name: `Mission outcome: ${params.missionTitle} (${params.outcome}, ${stamp})`,
                    content: `Mission "${params.missionTitle}" ${params.outcome} on ${stamp}.\nSummary: ${params.summary}${params.details ? `\n${params.details}` : ''}`,
                    type: 'text',
                    sourceModule: 'agent_mission',
                    metadata: { missionId: params.missionId, outcome: params.outcome },
                    createdById: new Types.ObjectId(params.userId),
                });
            }
        } catch (kbError) {
            console.error('[Workspace] Failed to index mission outcome into KB:', kbError);
        }
    } catch (error) {
        console.error('[Workspace] Failed to write mission report:', error);
    }
}

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
