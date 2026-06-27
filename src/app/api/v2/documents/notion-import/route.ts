import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import { userRepository } from '@/lib/db/repository/user.repository';
import Brand from '@/lib/db/models/brand.model';
import DocSyncLink from '@/lib/db/models/doc-sync-link.model';
import { documentRepository } from '@/lib/db/repository/document.repository';
import { docSyncLinkRepository } from '@/lib/db/repository/doc-sync-link.repository';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { NotionService } from '@/lib/services/notion.service';
import { getNotionDocSyncQueue } from '@/lib/queue/queue';
import { z } from 'zod';

const importSchema = z.object({
    brandId: z.string().min(1),
    databaseId: z.string().min(1),
    direction: z.enum(['pull', 'two_way']).default('pull'),
    limit: z.number().int().positive().max(50).optional(),
});

/**
 * POST /api/v2/documents/notion-import
 * Bulk-import a Notion database into many linked MontrAI documents.
 * Content is NOT pulled inline — a one-off 'sync-all-docs' job is kicked so the
 * 15-min cron worker fills in content within seconds.
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        const userId = (session?.user as { id?: string } | undefined)?.id;
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const user = await userRepository.findById(userId);
        const organizationId = user!.id?.toString();
        const parsed = importSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten() },
                { status: 400 }
            );
        }
        const { brandId, databaseId, direction, limit } = parsed.data;

        // Verify the brand belongs to this user/org before using its connection.
        const brand = await Brand.findById(brandId);
        const brandOwned =
            brand &&
            (brand.userId === userId ||
                (brand.userId && brand.userId.toString() === organizationId));
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

        const decrypted = await socialAccountRepository.findByIdWithTokens(accounts[0]._id.toString());
        if (!decrypted) {
            return NextResponse.json(
                { error: 'Notion connection could not be loaded.' },
                { status: 404 }
            );
        }

        const notion = new NotionService(decrypted.accessToken);
        const items = await notion.getDatabaseItems(databaseId);

        const cap = limit ?? 50;
        const candidates = items.slice(0, cap);

        let created = 0;
        let skipped = 0;
        const documents: { _id: string; title: string }[] = [];

        for (const item of candidates) {
            // Skip if any doc in this org is already linked to this Notion page.
            const existing = await DocSyncLink.findOne({
                externalId: item.id,
            });
            if (existing) {
                skipped++;
                continue;
            }

            const doc = await documentRepository.create({
                userId,
                title: item.title || 'Untitled Document',
                content: '',
            });
            const docId = (doc._id as { toString(): string }).toString();

            await docSyncLinkRepository.create({
                documentId: docId,
                userId,
                socialAccountId: accounts[0]._id.toString(),
                externalId: item.id,
                externalUrl: item.url || undefined,
                externalTitle: item.title || undefined,
                direction,
            });

            created++;
            documents.push({ _id: docId, title: doc.title });
        }

        // Kick a one-off sync so freshly linked docs get their content within
        // seconds rather than waiting for the 15-min cron. No repeat options.
        if (created > 0) {
            try {
                await getNotionDocSyncQueue().add('sync-all-docs', { trigger: 'manual' });
            } catch (e) {
                console.warn('[notion-import] Could not enqueue sync-all-docs kick (Redis might be down):', e instanceof Error ? e.message : String(e));
            }
        }

        return NextResponse.json({ created, skipped, documents });
    } catch (error) {
        console.error('Error importing Notion database:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
