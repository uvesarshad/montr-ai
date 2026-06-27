import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { NotionService } from '@/lib/services/notion.service';
import { assertBrandAccess, BrandAccessError, brandAccessErrorResponse } from '@/lib/social/brand-access';

/**
 * GET /api/social/notion/search?brandId=xxx&query=yyy
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const brandId = searchParams.get('brandId');
        const query = searchParams.get('query') || '';

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
        const results = await notionService.search(query);

        return NextResponse.json(results);
    } catch (error) {
        console.error('Notion search error:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to search Notion' },
            { status: 500 }
        );
    }
}
