/**
 * Workflow Templates API
 */

import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/mongodb';
import { WorkflowTemplate } from '@/lib/db/models/workflow-template.model';

/**
 * GET /api/v2/workflow-templates
 * List all workflow templates
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category');
    const type = searchParams.get('type');
    const difficulty = searchParams.get('difficulty');
    const sort = searchParams.get('sort') || 'popular';
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    // Agency mode (B2-5.4): brand-private templates are scoped, public
    // marketplace templates have no brandId. When the picker supplies a
    // brand, surface BOTH the brand-private and the public templates.
    const rawBrand = searchParams.get('brandId');
    const brandId = rawBrand && rawBrand !== 'all' && rawBrand !== '' ? rawBrand : undefined;

    // Build query
    const query: Record<string, unknown> = { isPublished: true };
    if (brandId) {
      query.$and = [
        { $or: [{ brandId: null }, { brandId: { $exists: false } }, { brandId }] },
      ];
    }

    if (category) {
      query.category = category;
    }

    if (type) {
      query.type = type;
    }

    if (difficulty) {
      query.difficulty = difficulty;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }

    // Build sort
    let sortQuery: Record<string, 1 | -1> = {};
    switch (sort) {
      case 'popular':
        sortQuery = { 'stats.installs': -1 };
        break;
      case 'rating':
        sortQuery = { 'stats.rating': -1 };
        break;
      case 'recent':
        sortQuery = { createdAt: -1 };
        break;
      default:
        sortQuery = { 'stats.installs': -1 };
    }

    const skip = (page - 1) * limit;

    const [templates, total] = await Promise.all([
      WorkflowTemplate.find(query)
        .sort(sortQuery)
        .skip(skip)
        .limit(limit)
        .lean(),
      WorkflowTemplate.countDocuments(query),
    ]);

    return NextResponse.json({
      templates,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + templates.length < total,
      },
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch templates', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
