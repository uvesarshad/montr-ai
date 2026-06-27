import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { mediaAssetRepository } from '@/lib/db/repository/media-asset.repository';
import { brandRepository } from '@/lib/db/repository/brand.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { checkSocialPlanLimit, getMediaStorageUsedMb, planLimitErrorBody } from '@/lib/social/plan-limits';

/**
 * Confirm the brand belongs to the caller (owner or same organization).
 * Returns true when access is allowed.
 */
async function userCanAccessBrand(
    brandId: string,
    session: { user: { id?: string | null; } }
): Promise<boolean> {
    const brand = await brandRepository.findById(brandId);
    if (!brand) return false;
    return (
        brand.userId === session.user.id ||
        Boolean(brand.userId && brand.userId === session.user.id)
    );
}

/**
 * GET /api/social/media
 * List media assets with filtering
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const brandId = searchParams.get('brandId');
        const folderId = searchParams.get('folderId');
        const type = searchParams.get('type') as 'image' | 'video' | null;
        const search = searchParams.get('search');
        const limit = parseInt(searchParams.get('limit') || '50', 10);

        if (!brandId) {
            return NextResponse.json({ error: 'brandId required' }, { status: 400 });
        }

        if (!(await userCanAccessBrand(brandId, session))) {
            return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
        }

        let assets;

        if (search) {
            assets = await mediaAssetRepository.search(brandId, search, limit);
        } else {
            const filters = {
                brandId,
                ...(folderId !== null && { folderId: folderId || null }),
                ...(type && { type }),
            };
            assets = await mediaAssetRepository.find(filters, limit);
        }

        const stats = await mediaAssetRepository.getStats(brandId);

        return NextResponse.json({ assets, stats });
    } catch (error) {
        console.error('Error fetching media:', error);
        return NextResponse.json(
            { error: 'Failed to fetch media' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/social/media
 * Create a new media asset record (after upload)
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const body = await request.json();
        const {
            brandId,
            url,
            thumbnailUrl,
            type,
            filename,
            originalName,
            mimeType,
            size,
            width,
            height,
            duration,
            folderId,
            tags,
            altText,
        } = body;

        if (!brandId || !url || !type || !filename || !originalName || !mimeType || !size) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        if (!(await userCanAccessBrand(brandId, session))) {
            return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
        }

        // Plan enforcement: org-wide media-storage cap (audit B3). The cap is in
        // MB; `pending` is the incoming file rounded up so current + pending must
        // stay within the limit. Org-less personal accounts are not capped.
        const brand = await brandRepository.findById(brandId);
        const organizationId =
            brand?.userId ||
            (session.user.id ? (await userRepository.findById(session.user.id))!.id : null) ||
            null;
        if (organizationId) {
            const orgId = organizationId;
            const pendingMb = Math.ceil(Number(size) / (1024 * 1024));
            const check = await checkSocialPlanLimit(
                orgId,
                'maxMediaStorageMb',
                () => getMediaStorageUsedMb(),
                { pending: Math.max(pendingMb, 1) }
            );
            if (!check.allowed) {
                return NextResponse.json(planLimitErrorBody(check), { status: 402 });
            }
        }

        const asset = await mediaAssetRepository.create({
            brandId,
            userId: session.user.id,
            url,
            thumbnailUrl,
            type,
            filename,
            originalName,
            mimeType,
            size,
            width,
            height,
            duration,
            folderId,
            tags,
            altText,
        });

        return NextResponse.json({ asset }, { status: 201 });
    } catch (error) {
        console.error('Error creating media asset:', error);
        return NextResponse.json(
            { error: 'Failed to create media asset' },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/social/media
 * Update media asset metadata
 */
export async function PATCH(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const body = await request.json();
        const { assetId, brandId, folderId, tags, altText } = body;

        if (!assetId || !brandId) {
            return NextResponse.json({ error: 'assetId and brandId required' }, { status: 400 });
        }

        if (!(await userCanAccessBrand(brandId, session))) {
            return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
        }

        const asset = await mediaAssetRepository.update(assetId, brandId, {
            folderId,
            tags,
            altText,
        });

        if (!asset) {
            return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
        }

        return NextResponse.json({ asset });
    } catch (error) {
        console.error('Error updating media asset:', error);
        return NextResponse.json(
            { error: 'Failed to update media asset' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/social/media
 * Delete media asset(s)
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const assetId = searchParams.get('id');
        const assetIds = searchParams.get('ids');
        const brandId = searchParams.get('brandId');

        if (!brandId) {
            return NextResponse.json({ error: 'brandId required' }, { status: 400 });
        }

        if (!(await userCanAccessBrand(brandId, session))) {
            return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
        }

        if (assetIds) {
            // Bulk delete
            const ids = assetIds.split(',');
            const deleted = await mediaAssetRepository.bulkDelete(ids, brandId);
            return NextResponse.json({ deleted });
        }

        if (!assetId) {
            return NextResponse.json({ error: 'Asset ID required' }, { status: 400 });
        }

        const deleted = await mediaAssetRepository.delete(assetId, brandId);
        if (!deleted) {
            return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting media asset:', error);
        return NextResponse.json(
            { error: 'Failed to delete media asset' },
            { status: 500 }
        );
    }
}
