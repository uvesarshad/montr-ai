/**
 * Notion ↔ Docs sync service.
 *
 * Direction semantics (DocSyncLink.direction):
 *  - pull:    Notion → MontrAI. Local edits are overwritten on the next pull.
 *  - push:    MontrAI → Notion. The Notion page is cleared and re-written.
 *  - two_way: last writer wins. Before a pull overwrites local changes, the
 *             current local content is snapshotted to DocVersion.
 *
 * Notion has no public change webhooks — the cron (notion-doc-sync queue)
 * polls last_edited_time and Document.updatedAt high-water marks.
 */

import { connectDB } from '@/lib/mongodb';
import DocumentModel from '@/lib/db/models/document.model';
import DocVersionModel from '@/lib/db/models/doc-version.model';
import type { IDocSyncLink } from '@/lib/db/models/doc-sync-link.model';
import { docSyncLinkRepository } from '@/lib/db/repository/doc-sync-link.repository';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { NotionService, NotionAuthError } from '@/lib/services/notion.service';
import { markSocialAccountNeedsReauth } from '@/lib/integrations/server/connection-health';
import { publishDomainEvent } from '@/lib/events/domain-bus';
import { blocksToHtml } from './blocks-to-html';
import { htmlToBlocks } from './html-to-blocks';

export type SyncAction = 'pulled' | 'pushed' | 'skipped' | 'error';

export interface SyncResult {
    linkId: string;
    documentId: string;
    action: SyncAction;
    conflict?: boolean;
    error?: string;
}

async function getNotionService(link: IDocSyncLink): Promise<NotionService> {
    const account = await socialAccountRepository.findByIdWithTokens(link.socialAccountId);
    if (!account) {
        throw new Error('Notion connection not found — it may have been disconnected.');
    }
    return new NotionService(account.accessToken);
}

async function snapshotDocument(
    documentId: string,
    userId: string,
    description: string
): Promise<void> {
    await connectDB();
    const doc = await DocumentModel.findById(documentId);
    if (!doc) return;

    const latest = await DocVersionModel.findOne({ docId: documentId })
        .sort({ version: -1 })
        .select('version');

    await DocVersionModel.create({
        docId: documentId,
        version: (latest?.version || 0) + 1,
        content: doc.content,
        title: doc.title,
        createdBy: userId,
        isAutoSave: true,
        changeDescription: description,
    });
}

/**
 * Pull the Notion page into the document.
 * `snapshotFirst` preserves the local content as a DocVersion before overwrite
 * (used on conflicts and on manual pulls over local edits).
 */
async function pullDoc(
    link: IDocSyncLink,
    notion: NotionService,
    options: { snapshotFirst?: boolean } = {}
): Promise<void> {
    const page = await notion.getPage(link.externalId);
    if (page.archived) {
        throw new Error('The linked Notion page has been archived.');
    }

    const blocks = await notion.getPageBlocks(link.externalId);
    const html = blocksToHtml(blocks);

    if (options.snapshotFirst) {
        await snapshotDocument(
            link.documentId,
            link.userId,
            'Snapshot before Notion pull (sync overwrite)'
        );
    }

    await connectDB();
    const updated = await DocumentModel.findByIdAndUpdate(
        link.documentId,
        { $set: { content: html, title: page.title || 'Untitled Document' } },
        { new: true }
    );
    if (!updated) {
        throw new Error('Linked document no longer exists.');
    }

    await docSyncLinkRepository.markSynced(link._id!.toString(), {
        externalLastEditedAt: page.lastEditedAt ? new Date(page.lastEditedAt) : null,
        localUpdatedAt: updated.updatedAt,
    });
}

/**
 * Push the document to the Notion page: clear existing children, append the
 * converted content, best-effort title update.
 */
async function pushDoc(link: IDocSyncLink, notion: NotionService): Promise<void> {
    await connectDB();
    const doc = await DocumentModel.findById(link.documentId);
    if (!doc) {
        throw new Error('Linked document no longer exists.');
    }

    const blocks = htmlToBlocks(doc.content || '');

    // Notion has no atomic replace — delete existing children, then append.
    const existingIds = await notion.listChildBlockIds(link.externalId);
    for (const blockId of existingIds) {
        await notion.deleteBlock(blockId);
    }
    await notion.appendBlocks(link.externalId, blocks as unknown as Record<string, unknown>[]);
    await notion.updatePageTitle(link.externalId, doc.title);

    // Re-read the page so the stored high-water mark includes our own write.
    const page = await notion.getPage(link.externalId);
    await docSyncLinkRepository.markSynced(link._id!.toString(), {
        externalLastEditedAt: page.lastEditedAt ? new Date(page.lastEditedAt) : null,
        localUpdatedAt: doc.updatedAt,
    });
}

/**
 * Sync one link according to its direction and what changed since the last
 * sync. `force` overrides change detection: 'pull' / 'push' run that action
 * unconditionally (used by the manual Sync-now button).
 */
export async function syncLink(
    link: IDocSyncLink,
    options: { force?: 'pull' | 'push' } = {}
): Promise<SyncResult> {
    const linkId = link._id!.toString();
    const base = { linkId, documentId: link.documentId };

    try {
        await docSyncLinkRepository.setStatus(linkId, 'syncing');
        const notion = await getNotionService(link);

        if (options.force === 'pull') {
            await pullDoc(link, notion, { snapshotFirst: true });
            return { ...base, action: 'pulled' };
        }
        if (options.force === 'push') {
            await pushDoc(link, notion);
            return { ...base, action: 'pushed' };
        }

        // Change detection against the stored high-water marks.
        const page = await notion.getPage(link.externalId);
        const externalChanged =
            !link.externalLastEditedAt ||
            (!!page.lastEditedAt && new Date(page.lastEditedAt) > link.externalLastEditedAt);

        await connectDB();
        const doc = await DocumentModel.findById(link.documentId).select('updatedAt');
        if (!doc) throw new Error('Linked document no longer exists.');
        const localChanged = !link.localUpdatedAt || doc.updatedAt > link.localUpdatedAt;

        if (link.direction === 'pull') {
            if (!externalChanged) {
                await docSyncLinkRepository.setStatus(linkId, 'idle');
                return { ...base, action: 'skipped' };
            }
            await pullDoc(link, notion);
            return { ...base, action: 'pulled' };
        }

        if (link.direction === 'push') {
            if (!localChanged) {
                await docSyncLinkRepository.setStatus(linkId, 'idle');
                return { ...base, action: 'skipped' };
            }
            await pushDoc(link, notion);
            return { ...base, action: 'pushed' };
        }

        // two_way
        if (!externalChanged && !localChanged) {
            await docSyncLinkRepository.setStatus(linkId, 'idle');
            return { ...base, action: 'skipped' };
        }
        if (externalChanged && localChanged) {
            // Conflict: last writer wins; snapshot before any local overwrite.
            const externalAt = page.lastEditedAt ? new Date(page.lastEditedAt).getTime() : 0;
            const localAt = doc.updatedAt.getTime();
            if (externalAt >= localAt) {
                await pullDoc(link, notion, { snapshotFirst: true });
                return { ...base, action: 'pulled', conflict: true };
            }
            await pushDoc(link, notion);
            return { ...base, action: 'pushed', conflict: true };
        }
        if (externalChanged) {
            await pullDoc(link, notion);
            return { ...base, action: 'pulled' };
        }
        await pushDoc(link, notion);
        return { ...base, action: 'pushed' };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Notion sync failed';
        console.error(`[NotionDocSync] Link ${linkId} failed:`, error);
        await docSyncLinkRepository.setStatus(linkId, 'error', message).catch(() => undefined);

        // A 401 means the Notion token was revoked/invalidated — flag the backing
        // connection so the UI shows a "reconnect Notion" prompt instead of the
        // cron failing silently on every future tick.
        if (error instanceof NotionAuthError) {
            await markSocialAccountNeedsReauth(
                link.socialAccountId,
                'Notion rejected the access token — reconnect Notion in Settings → Connections.'
            );
        }

        publishDomainEvent({
            type: 'docs.notion_sync_failed',
            source: 'integrations.notion.doc-sync',
            payload: {
                userId: link.userId,
                documentId: link.documentId,
                linkId,
                externalTitle: link.externalTitle,
                error: message,
            },
        });

        return { ...base, action: 'error', error: message };
    }
}

/**
 * Cron entry point: sync every link, gently rate-limited (Notion allows
 * ~3 requests/second per integration).
 */
export async function syncAllNotionDocs(): Promise<{
    processed: number;
    pulled: number;
    pushed: number;
    errors: number;
}> {
    const links = await docSyncLinkRepository.findAll();

    let pulled = 0;
    let pushed = 0;
    let errors = 0;

    for (const link of links) {
        const result = await syncLink(link);
        if (result.action === 'pulled') pulled++;
        else if (result.action === 'pushed') pushed++;
        else if (result.action === 'error') errors++;

        // Spacing between links keeps us safely under Notion's rate limit even
        // though each sync already makes several sequential API calls.
        await new Promise((resolve) => setTimeout(resolve, 350));
    }

    return { processed: links.length, pulled, pushed, errors };
}
