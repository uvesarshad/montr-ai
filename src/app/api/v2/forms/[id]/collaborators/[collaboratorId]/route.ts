import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import FormModel from '@/lib/db/models/form.model';
import FormCollaboratorModel from '@/lib/db/models/form-collaborator.model';
import { z } from 'zod';

const updateSchema = z.object({
    role: z.enum(['viewer', 'editor']),
});

/**
 * PATCH /api/v2/forms/[id]/collaborators/[collaboratorId]
 * Update a collaborator's role (owner only)
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; collaboratorId: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { id, collaboratorId } = await params;
        const userId = session.user.id!;

        await dbConnect();
        const form = await FormModel.findOne({ _id: id, userId });
        if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

        const body = await req.json();
        const { role } = updateSchema.parse(body);

        const collaborator = await FormCollaboratorModel.findOneAndUpdate(
            { _id: collaboratorId, formId: id },
            { $set: { role } },
            { new: true }
        );

        if (!collaborator) return NextResponse.json({ error: 'Collaborator not found' }, { status: 404 });

        return NextResponse.json({ collaborator });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
        }
        console.error('Error updating form collaborator:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * DELETE /api/v2/forms/[id]/collaborators/[collaboratorId]
 * Remove a collaborator (owner only)
 */
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string; collaboratorId: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { id, collaboratorId } = await params;
        const userId = session.user.id!;

        await dbConnect();
        const form = await FormModel.findOne({ _id: id, userId });
        if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

        const result = await FormCollaboratorModel.deleteOne({ _id: collaboratorId, formId: id });
        if (result.deletedCount === 0) return NextResponse.json({ error: 'Collaborator not found' }, { status: 404 });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error removing form collaborator:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
