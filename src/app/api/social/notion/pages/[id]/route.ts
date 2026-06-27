import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { NotionService } from '@/lib/services/notion.service';
import { assertBrandAccess, BrandAccessError, brandAccessErrorResponse } from '@/lib/social/brand-access';

/**
 * GET /api/social/notion/pages/[id]?brandId=xxx
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const brandId = searchParams.get('brandId');
        const pageId = params.id;

        if (!brandId) {
            return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
        }

        // Tenancy: confirm the brand belongs to the caller (audit C4).
        try {
            await assertBrandAccess(session.user.id, brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        // Find Notion account for this brand
        const accounts = await socialAccountRepository.findByBrandAndPlatform(brandId, 'notion');
        if (!accounts || accounts.length === 0) {
            return NextResponse.json({ error: 'Notion not connected for this brand' }, { status: 404 });
        }

        // Get decrypted tokens
        const decrypted = await socialAccountRepository.findByIdWithTokens(accounts[0]._id.toString());
        if (!decrypted) {
            return NextResponse.json({ error: 'Failed to retrieve Notion credentials' }, { status: 500 });
        }

        const notionService = new NotionService(decrypted.accessToken);

        // Fetch blocks and convert to markdown
        const blocks = await notionService.getPageBlocks(pageId);
        const markdown = notionService.blocksToMarkdown(blocks);

        return NextResponse.json({
            id: pageId,
            markdown,
            blocks: blocks.length
        });
    } catch (error) {
        console.error('Notion page fetch error:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to fetch Notion page' },
            { status: 500 }
        );
    }
}
