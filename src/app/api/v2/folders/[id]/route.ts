import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import FolderModel from '@/lib/db/models/folder.model';
import DocumentModel from '@/lib/db/models/document.model';
import DocCollaboratorModel from '@/lib/db/models/doc-collaborator.model';
import { z } from 'zod';

const updateFolderSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    parentId: z.string().nullable().optional(),
    isPublished: z.boolean().optional(),
});

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const userId = session.user.id!;

        // Fetch folder
        const folder = await FolderModel.findById(id);
        if (!folder) {
            return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        }

        // Authorize: only the owner or an invited collaborator may view the folder.
        if (folder.userId !== userId) {
            const collab = await DocCollaboratorModel.findOne({
                resourceId: id,
                resourceType: 'folder',
                $or: [{ userId }, ...(session.user.email ? [{ email: session.user.email }] : [])],
            });
            if (!collab) {
                return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
            }
        }

        // Ancestors for Breadcrumbs (scoped to the folder owner's tree).
        const ancestors = [];
        let currentParentId = folder.parentId;

        // Safety config for while loop
        let depth = 0;
        const MAX_DEPTH = 10;

        while (currentParentId && depth < MAX_DEPTH) {
            const parent = await FolderModel.findOne({ _id: currentParentId, userId: folder.userId });
            if (parent) {
                ancestors.unshift(parent);
                currentParentId = parent.parentId;
                depth++;
            } else {
                break;
            }
        }

        return NextResponse.json({ ...folder.toObject(), ancestors });
    } catch (error) {
        console.error('Error fetching folder:', error);
        return NextResponse.json({ error: 'Failed to fetch folder' }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const userId = session.user.id!;
        const body = await request.json();

        // Validate
        const validated = updateFolderSchema.parse(body);

        const folder = await FolderModel.findOne({ _id: id, userId });
        if (!folder) {
            return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        }

        if (validated.name !== undefined) folder.name = validated.name;
        if (validated.parentId !== undefined) folder.parentId = validated.parentId || undefined;

        // Publish logic
        if (validated.isPublished !== undefined) {
            folder.isPublished = validated.isPublished;
            if (folder.isPublished && !folder.publishedSlug) {
                // Generate slug
                const username = session.user.username! || session.user.email?.split('@')[0] || 'user';
                const titleSlug = folder.name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)/g, '')
                    .substring(0, 50);

                folder.publishedUsername = username;
                folder.publishedSlug = `${titleSlug}-${folder._id}`;
            }
        }

        await folder.save();

        return NextResponse.json(folder);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
        }
        console.error('Error updating folder:', error);
        return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 });
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const userId = session.user.id!;

        const folder = await FolderModel.findOne({ _id: id, userId });
        if (!folder) {
            return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
        }

        // Logic: Move contents to Root instead of recursive delete for safety
        // Move documents to Root
        await DocumentModel.updateMany({ folderId: id }, { $set: { folderId: null } });

        // Move subfolders to Root
        await FolderModel.updateMany({ parentId: id }, { $set: { parentId: null } });

        await FolderModel.deleteOne({ _id: id });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting folder:', error);
        return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
    }
}
