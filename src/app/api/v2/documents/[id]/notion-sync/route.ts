// OSS single-tenant override of src/app/api/v2/documents/[id]/notion-sync/route.ts — CP-2 hand-patch; org-stripped.
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import DocumentModel from '@/lib/db/models/document.model';
import Brand from '@/lib/db/models/brand.model';
import { docSyncLinkRepository } from '@/lib/db/repository/doc-sync-link.repository';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { syncLink } from '@/lib/integrations/notion/doc-sync';
import { z } from 'zod';

const createLinkSchema = z.object({
    brandId: z.string().min(1),
    notionPageId: z.string().min(1),
    direction: z.enum(['pull', 'push', 'two_way']),
    pageTitle: z.string().optional(),
    pageUrl: z.string().optional(),
});

const updateLinkSchema = z.object({
    direction: z.enum(['pull', 'push', 'two_way']).optional(),
    /** Manual sync trigger; 'pull'/'push' force that action. */
    syncNow: z.union([z.literal(true), z.literal('pull'), z.literal('push')]).optional(),
});

interface DocContext {
    userId: string;
    docId: string;
}

async function resolveDocContext(
    docId: string
): Promise<{ ok: true; context: DocContext } | { ok: false; status: number; error: string }> {
    const session = await getSession();
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return { ok: false, status: 401, error: 'Unauthorized' };

    await dbConnect();

    const doc = await DocumentModel.findById(docId).select('userId');
    if (!doc) return { ok: false, status: 404, error: 'Document not found' };
    if (doc.userId !== userId) return { ok: false, status: 403, error: 'Forbidden' };

    return { ok: true, context: { userId, docId } };
}

function serializeLink(link: NonNullable<Awaited<ReturnType<typeof docSyncLinkRepository.findByDocumentId>>>) {
    return {
        _id: link._id,
        documentId: link.documentId,
        externalId: link.externalId,
        externalUrl: link.externalUrl,
        externalTitle: link.externalTitle,
        direction: link.direction,
        lastSyncedAt: link.lastSyncedAt,
        syncStatus: link.syncStatus,
        lastError: link.lastError,
    };
}

/**
 * GET /api/v2/documents/[id]/notion-sync — current sync link (or null).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const auth = await resolveDocContext(id);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const link = await docSyncLinkRepository.findByDocumentId(id);
        return NextResponse.json({ link: link ? serializeLink(link) : null });
    } catch (error) {
        console.error('Error fetching notion sync link:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * POST /api/v2/documents/[id]/notion-sync — link the doc to a Notion page and
 * run the initial sync (pull for pull/two_way links, push for push links).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const auth = await resolveDocContext(id);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
        const { userId } = auth.context;

        const parsed = createLinkSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten() },
                { status: 400 }
            );
        }
        const { brandId, notionPageId, direction, pageTitle, pageUrl } = parsed.data;

        const existing = await docSyncLinkRepository.findByDocumentId(id);
        if (existing) {
            return NextResponse.json(
                { error: 'This document is already linked to a Notion page. Unlink it first.' },
                { status: 409 }
            );
        }

        // Verify the brand belongs to this user before using its connection.
        const brand = await Brand.findById(brandId);
        const brandOwned = brand && brand.userId === userId;
        if (!brandOwned) {
            return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
        }

        const accounts = await socialAccountRepository.findByBrandAndPlatform(brandId, 'notion');
        if (!accounts.length) {
            return NextResponse.json(
                { error: 'Notion is not connected for this brand. Connect it in Settings → Connections.' },
                { status: 404 }
            );
        }

        const link = await docSyncLinkRepository.create({
            documentId: id,
            userId,
            socialAccountId: accounts[0]._id.toString(),
            externalId: notionPageId,
            externalUrl: pageUrl,
            externalTitle: pageTitle,
            direction,
        });

        // Initial sync establishes the high-water marks.
        const result = await syncLink(link, {
            force: direction === 'push' ? 'push' : 'pull',
        });

        const fresh = await docSyncLinkRepository.findByDocumentId(id);
        return NextResponse.json(
            { link: fresh ? serializeLink(fresh) : null, result },
            { status: 201 }
        );
    } catch (error) {
        console.error('Error creating notion sync link:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * PATCH /api/v2/documents/[id]/notion-sync — change direction and/or sync now.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const auth = await resolveDocContext(id);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const parsed = updateLinkSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten() },
                { status: 400 }
            );
        }
        const { direction, syncNow } = parsed.data;

        let link = await docSyncLinkRepository.findByDocumentId(id);
        if (!link) {
            return NextResponse.json({ error: 'No Notion link for this document' }, { status: 404 });
        }

        if (direction && direction !== link.direction) {
            link = (await docSyncLinkRepository.updateDirection(id, direction))!;
        }

        let result = null;
        if (syncNow) {
            result = await syncLink(link, {
                force: syncNow === true ? undefined : syncNow,
            });
        }

        const fresh = await docSyncLinkRepository.findByDocumentId(id);
        return NextResponse.json({ link: fresh ? serializeLink(fresh) : null, result });
    } catch (error) {
        console.error('Error updating notion sync link:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * DELETE /api/v2/documents/[id]/notion-sync — unlink (keeps the doc content).
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const auth = await resolveDocContext(id);
        if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

        const deleted = await docSyncLinkRepository.delete(id);
        if (!deleted) {
            return NextResponse.json({ error: 'No Notion link for this document' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting notion sync link:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
