import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import DocumentModel from '@/lib/db/models/document.model';
import { integrationConnectionRepository } from '@/lib/db/repository/integration-connection.repository';
import { WordPressService } from '@/lib/services/wordpress.service';
import { z } from 'zod';

const publishSchema = z.object({
    connectionId: z.string().min(1).optional(),
    brandId: z.string().min(1).optional(),
    status: z.enum(['draft', 'publish']).default('draft'),
    title: z.string().optional(),
});

interface DocContext {
    userId: string;
    doc: { _id: string; title: string; content: string };
}

async function resolveDocContext(
    docId: string
): Promise<{ ok: true; context: DocContext } | { ok: false; status: number; error: string }> {
    const session = await getSession();
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return { ok: false, status: 401, error: 'Unauthorized' };

    await dbConnect();
    const doc = await DocumentModel.findById(docId).select('userId title content');
    if (!doc) return { ok: false, status: 404, error: 'Document not found' };
    if (doc.userId !== userId) return { ok: false, status: 403, error: 'Forbidden' };

    return {
        ok: true,
        context: {
            userId,
            doc: { _id: String(doc._id), title: doc.title, content: doc.content || '' },
        },
    };
}

/**
 * POST /api/v2/documents/[id]/publish-wordpress — create a WordPress post from
 * this document's HTML content using a connected WordPress integration.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const ctx = await resolveDocContext(id);
        if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
        const { doc } = ctx.context;

        const parsed = publishSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid request', details: parsed.error.flatten() },
                { status: 400 }
            );
        }
        const { connectionId, brandId, status, title } = parsed.data;

        // Resolve the WordPress connection (explicit connection, else brand chain).
        const resolved = connectionId
            ? await integrationConnectionRepository.findByIdWithCredentials(
                  connectionId
              )
            : await integrationConnectionRepository.resolveForBrand(
                  'wordpress',
                  brandId
              );

        if (!resolved) {
            return NextResponse.json(
                {
                    error:
                        'No WordPress connection found. Connect WordPress in Settings → Connections first.',
                },
                { status: 404 }
            );
        }
        if (resolved.connection.provider !== 'wordpress') {
            return NextResponse.json(
                { error: 'The selected connection is not a WordPress connection.' },
                { status: 400 }
            );
        }

        const { baseUrl, username, appPassword } = resolved.credentials;
        if (!baseUrl || !username || !appPassword) {
            return NextResponse.json(
                { error: 'The WordPress connection is missing credentials. Reconnect it in Settings.' },
                { status: 400 }
            );
        }

        const service = new WordPressService({ baseUrl, username, appPassword });
        const post = await service.createPost({
            title: title || doc.title,
            content: doc.content,
            status,
        });

        await integrationConnectionRepository.markUsed(String(resolved.connection._id));

        return NextResponse.json({
            post: { id: post.id, link: post.link, status: post.status },
        });
    } catch (error) {
        console.error('Error publishing document to WordPress:', error);
        const message = error instanceof Error ? error.message : 'Internal Server Error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
