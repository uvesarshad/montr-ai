import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import CanvasTemplate from '@/lib/db/models/canvas-template.model';
import CanvasTemplateReview, { ICanvasTemplateReview } from '@/lib/db/models/canvas-template-review.model';
import { getBuiltInCanvasTemplateById } from '@/lib/canvas/template-catalog';

// GET - List reviews for a template
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await dbConnect();
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '10', 10);

        // Built-in templates have no DB reviews
        const _isBuiltIn = Boolean(getBuiltInCanvasTemplateById(id));

        const query = { templateId: id };
        const total = await CanvasTemplateReview.countDocuments(query);
        const reviews = await CanvasTemplateReview.find(query)
            .sort({ helpfulCount: -1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean<ICanvasTemplateReview[]>();

        const session = await getSession();

        return NextResponse.json({
            reviews: reviews.map((r) => ({
                _id: r._id.toString(),
                userId: r.userId.toString(),
                userName: r.userName,
                rating: r.rating,
                comment: r.comment,
                helpfulCount: r.helpfulCount,
                isOwn: session?.user?.id === r.userId.toString(),
                createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: (page - 1) * limit + reviews.length < total,
            },
        });
    } catch (error) {
        console.error('Failed to fetch reviews:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) || 'Failed to fetch reviews' }, { status: 500 });
    }
}

// POST - Create or update a review
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const { id } = await params;
        const body = await request.json();
        const { rating, comment } = body;

        if (!rating || rating < 1 || rating > 5) {
            return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 });
        }

        // Check template exists (either built-in or DB)
        const isBuiltIn = Boolean(getBuiltInCanvasTemplateById(id));
        if (!isBuiltIn) {
            const template = await CanvasTemplate.findById(id);
            if (!template || (template.status !== 'published' && template.authorId.toString() !== session.user.id)) {
                return NextResponse.json({ error: 'Template not found or not accessible' }, { status: 404 });
            }
        }

        // Upsert review
        const existing = await CanvasTemplateReview.findOne({
            templateId: id,
            userId: session.user.id,
        });

        if (existing) {
            existing.rating = rating;
            existing.comment = comment?.trim();
            await existing.save();
        } else {
            await CanvasTemplateReview.create({
                templateId: id,
                userId: session.user.id,
                userName: session.user.name || 'Anonymous',
                rating,
                comment: comment?.trim(),
            });
        }

        // Recalculate aggregate rating on the template (skip for built-ins)
        if (!isBuiltIn) {
            const agg = await CanvasTemplateReview.aggregate([
                { $match: { templateId: id } },
                { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
            ]);
            if (agg.length > 0) {
                await CanvasTemplate.findByIdAndUpdate(id, {
                    rating: Math.round(agg[0].avg * 10) / 10,
                    ratingCount: agg[0].count,
                });
            }
        }

        return NextResponse.json({
            success: true,
            message: existing ? 'Review updated' : 'Review submitted',
        });
    } catch (error) {
        console.error('Failed to submit review:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) || 'Failed to submit review' }, { status: 500 });
    }
}

// DELETE - Remove own review
export async function DELETE(
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

        await CanvasTemplateReview.deleteOne({ templateId: id, userId: session.user.id });

        // Recalculate
        const isBuiltIn = Boolean(getBuiltInCanvasTemplateById(id));
        if (!isBuiltIn) {
            const agg = await CanvasTemplateReview.aggregate([
                { $match: { templateId: id } },
                { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
            ]);
            await CanvasTemplate.findByIdAndUpdate(id, {
                rating: agg.length > 0 ? Math.round(agg[0].avg * 10) / 10 : 0,
                ratingCount: agg.length > 0 ? agg[0].count : 0,
            });
        }

        return NextResponse.json({ success: true, message: 'Review removed' });
    } catch (error) {
        console.error('Failed to delete review:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) || 'Failed to delete review' }, { status: 500 });
    }
}
