import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import CanvasTemplate from '@/lib/db/models/canvas-template.model';

// POST - Submit a draft template for community review
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const { id } = await params;
        const template = await CanvasTemplate.findById(id);

        if (!template) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }
        if (template.authorId.toString() !== session.user.id) {
            return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
        }
        if (template.status !== 'draft' && template.status !== 'rejected') {
            return NextResponse.json(
                { error: `Template is already ${template.status}` },
                { status: 400 }
            );
        }

        template.status = 'pending';
        template.rejectionReason = undefined;
        await template.save();

        return NextResponse.json({
            success: true,
            status: 'pending',
            message: 'Template submitted for review. We\'ll notify you when it\'s approved.',
        });
    } catch (error) {
        console.error('Failed to publish template:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) || 'Failed to submit template' }, { status: 500 });
    }
}
