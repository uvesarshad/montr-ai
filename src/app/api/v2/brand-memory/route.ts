import { NextResponse } from 'next/server';

import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import KnowledgeBase from '@/lib/db/models/knowledge-base.model';

/**
 * GET /api/v2/brand-memory?brandId=xxx&sourceModule=crm&type=text&page=1&limit=20
 * List brand memory entries filtered by brand, source module, or type.
 */
export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const brandId = searchParams.get('brandId');
        const sourceModule = searchParams.get('sourceModule');
        const type = searchParams.get('type');
        const search = searchParams.get('search');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const skip = (page - 1) * limit;
        await dbConnect();

        const query: Record<string, unknown> = { isActive: true };
        if (brandId) query.brandId = brandId;
        if (sourceModule) query.sourceModule = sourceModule;
        if (type) query.type = type;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { content: { $regex: search, $options: 'i' } },
                { 'metadata.fileName': { $regex: search, $options: 'i' } },
                { 'metadata.tags': { $regex: search, $options: 'i' } },
            ];
        }

        const [entries, total] = await Promise.all([
            KnowledgeBase.find(query)
                .select('-embedding -chunks')
                .sort({ updatedAt: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            KnowledgeBase.countDocuments(query),
        ]);

        return NextResponse.json({
            entries,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: page * limit < total,
            },
        });
    } catch (error) {
        console.error('Error fetching brand memory:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

/**
 * POST /api/v2/brand-memory
 * Manually add a knowledge entry.
 */
export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const body = await req.json();
        const { brandId, name, content, type, metadata } = body;

        if (!name || !content || !type) {
            return new NextResponse('name, content, and type are required', { status: 400 });
        }

        await dbConnect();
        const entry = await KnowledgeBase.create({
            brandId: brandId || null,
            name,
            content,
            type,
            sourceModule: 'manual',
            metadata: metadata || {},
            isActive: true,
            createdById: session.user.id,
        });

        return NextResponse.json(entry, { status: 201 });
    } catch (error) {
        console.error('Error creating brand memory entry:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

/**
 * PATCH /api/v2/brand-memory
 * Update a manual knowledge entry by ID.
 */
export async function PATCH(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const body = await req.json();
        const { id, name, content, type, metadata } = body;

        if (!id || !name || !content || !type) {
            return new NextResponse('id, name, content, and type are required', { status: 400 });
        }

        await dbConnect();
        const entry = await KnowledgeBase.findOneAndUpdate(
            {
                _id: id,
                isActive: true,
            },
            {
                $set: {
                    name,
                    content,
                    type,
                    metadata: metadata || {},
                },
            },
            {
                new: true,
            }
        ).select('-embedding -chunks');

        if (!entry) {
            return new NextResponse('Knowledge entry not found', { status: 404 });
        }

        return NextResponse.json(entry);
    } catch (error) {
        console.error('Error updating brand memory entry:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

/**
 * DELETE /api/v2/brand-memory
 * Soft-delete one or more knowledge entries by IDs.
 */
export async function DELETE(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { ids } = await req.json();
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return new NextResponse('ids array is required', { status: 400 });
        }

        await dbConnect();
        const result = await KnowledgeBase.updateMany(
            { _id: { $in: ids } },
            { $set: { isActive: false } }
        );

        return NextResponse.json({ deleted: result.modifiedCount });
    } catch (error) {
        console.error('Error deleting brand memory entries:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
