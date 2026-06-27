import { NextRequest, NextResponse } from 'next/server';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { brandRepository } from '@/lib/db/repository/brand.repository';
import { getSession } from '@/lib/get-session';

interface RouteParams {
    params: Promise<{ brandId: string }>;
}

/**
 * Get all social accounts for a brand
 * GET /api/social/brands/[brandId]/accounts
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { brandId } = await params;

        // Verify brand ownership
        const brand = await brandRepository.findById(brandId);
        if (!brand) {
            return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
        }

        // Check if user owns the brand or is in the organization
        const hasAccess = brand.userId === session.user.id! ||
            (brand.userId && brand.userId === session.user.id);

        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const accounts = await socialAccountRepository.findByBrandId(brandId);

        return NextResponse.json({ accounts });
    } catch (error) {
        console.error('Error fetching social accounts:', error);
        return NextResponse.json(
            { error: 'Failed to fetch social accounts' },
            { status: 500 }
        );
    }
}
