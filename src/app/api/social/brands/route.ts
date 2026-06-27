import { NextRequest, NextResponse } from 'next/server';
import { brandRepository } from '@/lib/db/repository/brand.repository';
import { getSession } from '@/lib/get-session';

/**
 * Get all brands for the current user
 * GET /api/social/brands
 */
export async function GET() {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const brands = await brandRepository.findAccessibleBrands(
            session.user.id
        );

        return NextResponse.json({ brands });
    } catch (error) {
        console.error('Error fetching brands:', error);
        return NextResponse.json(
            { error: 'Failed to fetch brands' },
            { status: 500 }
        );
    }
}

/**
 * Create a new brand
 * POST /api/social/brands
 * Body: { name: string, handle: string, avatarUrl?: string }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { name, handle, avatarUrl } = body;

        if (!name || !handle) {
            return NextResponse.json(
                { error: 'name and handle are required' },
                { status: 400 }
            );
        }

        // Check if handle is available
        const isAvailable = await brandRepository.isHandleAvailable(session.user.id!, handle);
        if (!isAvailable) {
            return NextResponse.json(
                { error: 'Handle is already taken' },
                { status: 400 }
            );
        }

        // Plan enforcement: org-wide brand cap (audit B3). Org-less personal
        // accounts are not capped. organizationId is read from the session
        // (derived server-side), never trusted from the client.
        const brand = await brandRepository.create({
            name,
            handle,
            userId: session.user.id,
            avatarUrl,
        });

        return NextResponse.json({ brand }, { status: 201 });
    } catch (error) {
        console.error('Error creating brand:', error);
        console.error('Error name:', (error instanceof Error ? error.name : undefined));
        console.error('Error message:', (error instanceof Error ? error.message : undefined));
        console.error('Error stack:', (error instanceof Error ? error.stack : undefined));
        return NextResponse.json(
            { error: 'Failed to create brand', details: (error instanceof Error ? error.message : 'Unknown error') },
            { status: 500 }
        );
    }
}
