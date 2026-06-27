import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import DocCollaboratorModel from '@/lib/db/models/doc-collaborator.model';
import User from '@/lib/db/models/user.model';
import DocumentModel from '@/lib/db/models/document.model';
import FolderModel from '@/lib/db/models/folder.model';
import { z } from 'zod';

const inviteSchema = z.object({
    resourceId: z.string(),
    resourceType: z.enum(['document', 'folder']),
    email: z.string().email(),
    role: z.enum(['viewer', 'editor']).default('viewer'),
});

const removeSchema = z.object({
    collaboratorId: z.string(),
});

/**
 * GET /api/v2/collaborators
 * List collaborators for a resource
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const resourceId = searchParams.get('resourceId');

        if (!resourceId) {
            return NextResponse.json({ error: 'resourceId required' }, { status: 400 });
        }

        // Verify the caller owns or collaborates on the resource before exposing
        // who else has access (collaborator emails are PII).
        const userId = session.user.id!;
        const owns =
            (await DocumentModel.exists({ _id: resourceId, userId })) ||
            (await FolderModel.exists({ _id: resourceId, userId }));
        if (!owns) {
            const collab = await DocCollaboratorModel.findOne({
                resourceId,
                $or: [{ userId }, ...(session.user.email ? [{ email: session.user.email }] : [])],
            });
            if (!collab) {
                return NextResponse.json({ error: 'Not found' }, { status: 404 });
            }
        }

        const collaborators = await DocCollaboratorModel.find({ resourceId });

        return NextResponse.json({ collaborators });
    } catch (error) {
        console.error('Error fetching collaborators:', error);
        return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
    }
}

/**
 * POST /api/v2/collaborators
 * Invite a user
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id!;
        const body = await request.json();
        const validated = inviteSchema.parse(body);

        // 1. Verify owner of resource
        let resource;
        if (validated.resourceType === 'document') {
            resource = await DocumentModel.findOne({ _id: validated.resourceId, userId });
        } else {
            resource = await FolderModel.findOne({ _id: validated.resourceId, userId });
        }

        if (!resource) {
            // Check if I am an editor?
            // For now, strict ownership for invites.
            return NextResponse.json({ error: 'Resource not found or unauthorized' }, { status: 403 });
        }

        // 2. Check if user exists in system
        const invitedUser = await User.findOne({ email: validated.email });

        // 3. Create Collaboration Record
        const collab = await DocCollaboratorModel.create({
            resourceId: validated.resourceId,
            resourceType: validated.resourceType,
            userId: invitedUser ? invitedUser._id : null,
            email: validated.email,
            role: validated.role,
            invitedBy: userId,
        });

        // TODO: Send Email Notification

        return NextResponse.json(collab, { status: 201 });

    } catch (error) {
        console.error('Error inviting collaborator:', error);
        return NextResponse.json({ error: 'Failed to invite' }, { status: 500 });
    }
}

/**
 * DELETE /api/v2/collaborators
 * Remove a collaborator
 */
export async function DELETE(request: NextRequest) {
    // ... Implementation for removing access
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id!;
        const { searchParams } = new URL(request.url);
        const collaboratorId = searchParams.get('id');

        if (!collaboratorId) {
            return NextResponse.json({ error: 'ID required' }, { status: 400 });
        }

        const collab = await DocCollaboratorModel.findById(collaboratorId);
        if (!collab) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 });
        }

        // Verify I am the owner of the resource
        // We need to fetch resource to check owner
        let resource;
        if (collab.resourceType === 'document') {
            resource = await DocumentModel.findOne({ _id: collab.resourceId, userId });
        } else {
            resource = await FolderModel.findOne({ _id: collab.resourceId, userId });
        }

        // Or if I am removing MYSELF
        const isSelfRemoval = collab.userId === userId || (collab.email === session.user.email);

        if (!resource && !isSelfRemoval) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        await DocCollaboratorModel.deleteOne({ _id: collaboratorId });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Error removing collaborator:', error);
        return NextResponse.json({ error: 'Failed to remove' }, { status: 500 });
    }
}
