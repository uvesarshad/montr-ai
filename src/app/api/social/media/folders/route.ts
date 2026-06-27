import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import { mediaFolderRepository } from '@/lib/db/repository/media-folder.repository';
import { assertBrandAccess, BrandAccessError, brandAccessErrorResponse } from '@/lib/social/brand-access';

const createFolderSchema = z.object({
    brandId: z.string().min(1),
    name: z.string().min(1),
    parentId: z.string().optional(),
    color: z.string().optional(),
});

const updateFolderSchema = z.object({
    folderId: z.string().min(1),
    name: z.string().optional(),
    parentId: z.string().nullable().optional(),
    color: z.string().optional(),
});

/**
 * GET /api/social/media/folders
 * List folders for a brand
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const brandId = searchParams.get('brandId');
        const tree = searchParams.get('tree') === 'true';

        if (!brandId) {
            return NextResponse.json({ error: 'brandId required' }, { status: 400 });
        }

        // Tenancy: confirm the brand belongs to the caller (audit C4).
        try {
            await assertBrandAccess(session.user.id, brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        if (tree) {
            const folderTree = await mediaFolderRepository.getFolderTree(brandId);
            return NextResponse.json({ folders: folderTree });
        }

        const folders = await mediaFolderRepository.findByBrand(brandId);
        return NextResponse.json({ folders });
    } catch (error) {
        console.error('Error fetching folders:', error);
        return NextResponse.json(
            { error: 'Failed to fetch folders' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/social/media/folders
 * Create a new folder
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const parsed = createFolderSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'brandId and name required' },
                { status: 400 }
            );
        }
        const { brandId, name, parentId, color } = parsed.data;

        // Tenancy: confirm the brand belongs to the caller (audit C4).
        try {
            await assertBrandAccess(session.user.id, brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        const folder = await mediaFolderRepository.create({
            brandId,
            userId: session.user.id,
            name: name.trim(),
            parentId,
            color,
        });

        return NextResponse.json({ folder }, { status: 201 });
    } catch (error) {
        console.error('Error creating folder:', error);
        return NextResponse.json(
            { error: 'Failed to create folder' },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/social/media/folders
 * Update a folder
 */
export async function PATCH(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const parsed = updateFolderSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'folderId required' }, { status: 400 });
        }
        const { folderId, name, parentId, color } = parsed.data;

        // Tenancy: load the folder and confirm its brand belongs to the caller (audit C4).
        const existing = await mediaFolderRepository.findById(folderId);
        if (!existing) {
            return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        }
        try {
            await assertBrandAccess(session.user.id, existing.brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        const folder = await mediaFolderRepository.update(folderId, {
            name: name?.trim(),
            parentId,
            color,
        });

        if (!folder) {
            return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        }

        return NextResponse.json({ folder });
    } catch (error) {
        console.error('Error updating folder:', error);
        return NextResponse.json(
            { error: 'Failed to update folder' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/social/media/folders
 * Delete a folder (assets moved to root)
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const folderId = searchParams.get('id');

        if (!folderId) {
            return NextResponse.json({ error: 'Folder ID required' }, { status: 400 });
        }

        // Tenancy: load the folder and confirm its brand belongs to the caller (audit C4).
        const existing = await mediaFolderRepository.findById(folderId);
        if (!existing) {
            return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        }
        try {
            await assertBrandAccess(session.user.id, existing.brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        const deleted = await mediaFolderRepository.delete(folderId);
        if (!deleted) {
            return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting folder:', error);
        return NextResponse.json(
            { error: 'Failed to delete folder' },
            { status: 500 }
        );
    }
}
