import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import FormModel from '@/lib/db/models/form.model';
import FormCollaboratorModel from '@/lib/db/models/form-collaborator.model';
import { z } from 'zod';

const addCollaboratorSchema = z.object({
    email: z.string().email().optional(),
    userId: z.string().optional(),
    role: z.enum(['viewer', 'editor']).default('viewer'),
}).refine(data => data.email || data.userId, {
    message: 'Either email or userId is required',
});

async function getFormOrForbid(formId: string, userId: string) {
    await dbConnect();
    const form = await FormModel.findOne({ _id: formId, userId });
    return form;
}

/**
 * GET /api/v2/forms/[id]/collaborators
 * List collaborators for a form (owner only)
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { id } = await params;
        const userId = session.user.id!;
        const form = await getFormOrForbid(id, userId);
        if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

        const collaborators = await FormCollaboratorModel.find({ formId: id }).sort({ createdAt: -1 });
        return NextResponse.json({ collaborators });
    } catch (error) {
        console.error('Error fetching form collaborators:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

/**
 * POST /api/v2/forms/[id]/collaborators
 * Add a collaborator to a form (owner only)
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { id } = await params;
        const userId = session.user.id!;
        const form = await getFormOrForbid(id, userId);
        if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

        const body = await req.json();
        const validated = addCollaboratorSchema.parse(body);

        // Prevent duplicate
        const existing = await FormCollaboratorModel.findOne({
            formId: id,
            ...(validated.userId ? { userId: validated.userId } : { email: validated.email }),
        });
        if (existing) {
            return NextResponse.json({ error: 'Already a collaborator' }, { status: 409 });
        }

        const collaborator = await FormCollaboratorModel.create({
            formId: id,
            userId: validated.userId ?? null,
            email: validated.email ?? null,
            role: validated.role,
            invitedBy: userId,
        });

        return NextResponse.json({ collaborator }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
        }
        console.error('Error adding form collaborator:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
