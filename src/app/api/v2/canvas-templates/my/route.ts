import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import CanvasTemplate, { ICanvasTemplate } from '@/lib/db/models/canvas-template.model';

// GET - List authenticated user's own templates (all statuses)
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();

        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '20', 10);
        const status = searchParams.get('status');

        const query: Record<string, unknown> = { authorId: session.user.id };
        if (status && ['draft', 'pending', 'published', 'rejected', 'archived'].includes(status)) {
            query.status = status;
        }

        const total = await CanvasTemplate.countDocuments(query);
        const templates = await CanvasTemplate.find(query)
            .select('-nodesJson -edgesJson')
            .sort({ updatedAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        return NextResponse.json({
            templates: (templates as (Partial<ICanvasTemplate> & { _id: { toString(): string } })[]).map((t) => ({
                _id: t._id.toString(),
                name: t.name,
                description: t.description,
                category: t.category,
                difficulty: t.difficulty,
                tags: t.tags || [],
                previewImageUrl: t.previewImageUrl,
                screenshots: t.screenshots || [],
                usageCount: t.usageCount || 0,
                rating: t.rating || 0,
                ratingCount: t.ratingCount || 0,
                isFeatured: Boolean(t.isFeatured),
                isOfficial: Boolean(t.isOfficial),
                source: t.isOfficial ? 'official' : 'community',
                isBuiltIn: false,
                status: t.status,
                rejectionReason: t.rejectionReason,
                isPublic: t.isPublic,
                version: t.version || '1.0.0',
                createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : undefined,
                updatedAt: t.updatedAt ? new Date(t.updatedAt).toISOString() : undefined,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: (page - 1) * limit + templates.length < total,
            },
        });
    } catch (error) {
        console.error('Failed to fetch my templates:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) || 'Failed to fetch templates' }, { status: 500 });
    }
}
