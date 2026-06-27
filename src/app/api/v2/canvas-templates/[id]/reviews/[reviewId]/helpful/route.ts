import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import CanvasTemplateReview from '@/lib/db/models/canvas-template-review.model';

export async function POST(
    _request: NextRequest,
    props: { params: Promise<{ id: string; reviewId: string }> }
) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();

        const review = await CanvasTemplateReview.findOneAndUpdate(
            { _id: params.reviewId, templateId: params.id },
            { $inc: { helpfulCount: 1 } },
            { new: true }
        );

        if (!review) {
            return NextResponse.json({ error: 'Review not found' }, { status: 404 });
        }

        return NextResponse.json({ helpfulCount: review.helpfulCount });
    } catch (error) {
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to mark helpful' },
            { status: 500 }
        );
    }
}
