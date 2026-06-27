import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import CanvasTemplate, { TEMPLATE_CATEGORIES, TEMPLATE_DIFFICULTIES, type ICanvasTemplate } from '@/lib/db/models/canvas-template.model';
import {
    listBuiltInCanvasTemplates,
    matchesCanvasTemplateFilters,
    type CanvasTemplateSummary,
} from '@/lib/canvas/template-catalog';
import type { Types, Document } from 'mongoose';

function parseStepCount(nodesJson?: string) {
    if (!nodesJson) return 0;
    try {
        const nodes = JSON.parse(nodesJson);
        return Array.isArray(nodes) ? nodes.length : 0;
    } catch {
        return 0;
    }
}

type LeanCanvasTemplate = Omit<ICanvasTemplate, keyof Document> & { _id: Types.ObjectId };

function mapDbTemplateToSummary(template: LeanCanvasTemplate): CanvasTemplateSummary {
    const stepCount = parseStepCount(template.nodesJson);
    return {
        _id: template._id.toString(),
        name: template.name,
        description: template.description,
        category: template.category,
        difficulty: template.difficulty,
        tags: template.tags || [],
        previewImageUrl: template.previewImageUrl,
        screenshots: template.screenshots || [],
        authorName: template.authorName || 'Community',
        usageCount: template.usageCount || 0,
        rating: template.rating || 0,
        ratingCount: template.ratingCount || 0,
        isFeatured: Boolean(template.isFeatured),
        isOfficial: Boolean(template.isOfficial),
        source: template.isOfficial ? 'official' : 'community',
        isBuiltIn: false,
        stepCount,
        setupTime: stepCount > 0 ? Math.max(stepCount * 3, 5) : 5,
        version: template.version || '1.0.0',
        createdAt: template.createdAt ? new Date(template.createdAt).toISOString() : undefined,
        updatedAt: template.updatedAt ? new Date(template.updatedAt).toISOString() : undefined,
    };
}

function sortTemplates(sortParam: string): Record<string, 1 | -1> {
    switch (sortParam) {
        case 'newest':
            return { createdAt: -1 };
        case 'rating':
            return { rating: -1, ratingCount: -1 };
        case 'trending':
            return { viewCount: -1, usageCount: -1 };
        default:
            return { isFeatured: -1, usageCount: -1, rating: -1 };
    }
}

function compareSummaries(sort: string) {
    return (left: CanvasTemplateSummary, right: CanvasTemplateSummary) => {
        if (sort === 'newest') {
            return (right.createdAt || '') > (left.createdAt || '') ? 1 : -1;
        }
        if (sort === 'rating') {
            if (left.rating !== right.rating) return right.rating - left.rating;
            return right.ratingCount - left.ratingCount;
        }
        // popular / trending / default
        if (left.isFeatured !== right.isFeatured) return left.isFeatured ? -1 : 1;
        if (left.isOfficial !== right.isOfficial) return left.isOfficial ? -1 : 1;
        if (left.usageCount !== right.usageCount) return right.usageCount - left.usageCount;
        if (left.rating !== right.rating) return right.rating - left.rating;
        return left.name.localeCompare(right.name);
    };
}

// GET - List templates (public marketplace)
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        await dbConnect();

        const { searchParams } = new URL(request.url);
        const category = searchParams.get('category');
        const difficulty = searchParams.get('difficulty');
        const search = searchParams.get('search');
        const featured = searchParams.get('featured') === 'true';
        const source = searchParams.get('source'); // 'official' | 'community'
        const tags = searchParams.get('tags'); // comma-separated
        const sort = searchParams.get('sort') || 'popular'; // popular | newest | rating | trending
        const myTemplates = searchParams.get('my') === 'true';
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = parseInt(searchParams.get('limit') || '20', 10);

        const query: Record<string, unknown> = {};

        if (myTemplates && session?.user?.id) {
            query.authorId = session.user.id!;
        } else {
            query.status = 'published';
            query.isPublic = true;
        }

        if (category && TEMPLATE_CATEGORIES.includes(category as (typeof TEMPLATE_CATEGORIES)[number])) {
            query.category = category;
        }
        if (difficulty && TEMPLATE_DIFFICULTIES.includes(difficulty as (typeof TEMPLATE_DIFFICULTIES)[number])) {
            query.difficulty = difficulty;
        }
        if (featured) {
            query.isFeatured = true;
        }
        if (source === 'official') {
            query.isOfficial = true;
        } else if (source === 'community') {
            query.isOfficial = { $ne: true };
        }
        if (tags) {
            const tagList = tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
            if (tagList.length > 0) query.tags = { $in: tagList };
        }

        const builtInTemplates = myTemplates
            ? []
            : listBuiltInCanvasTemplates()
                .filter((t) => {
                    if (!matchesCanvasTemplateFilters(t, { category, difficulty, search, featured })) return false;
                    if (source === 'community') return false;
                    if (tags) {
                        const tagList = tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
                        if (tagList.length > 0 && !tagList.some((tag) => t.tags.includes(tag))) return false;
                    }
                    return true;
                })
                .map(({ flowData: _flowData, ...summary }) => summary as CanvasTemplateSummary);

        const dbQuery = search
            ? { ...query, $text: { $search: search } }
            : query;

        const dbTemplates = await CanvasTemplate.find(dbQuery)
            .select('name description category difficulty tags previewImageUrl screenshots authorName usageCount rating ratingCount isFeatured isOfficial nodesJson version createdAt updatedAt')
            .sort(search ? { score: { $meta: 'textScore' }, usageCount: -1 } : sortTemplates(sort))
            .lean();

        const combinedTemplates = [...builtInTemplates, ...(dbTemplates as unknown as LeanCanvasTemplate[]).map(mapDbTemplateToSummary)]
            .sort(compareSummaries(sort));

        const total = combinedTemplates.length;
        const startIndex = (page - 1) * limit;
        const templates = combinedTemplates.slice(startIndex, startIndex + limit);

        // Collect all unique tags across results for filter hints
        const allTags = Array.from(
            new Set(combinedTemplates.flatMap((t) => t.tags))
        ).sort();

        return NextResponse.json({
            templates,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: startIndex + limit < total,
            },
            categories: TEMPLATE_CATEGORIES,
            difficulties: TEMPLATE_DIFFICULTIES,
            tags: allTags,
        });
    } catch (error) {
        console.error('Failed to fetch templates:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to fetch templates' },
            { status: 500 }
        );
    }
}

// POST - Create/submit a template
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();

        const body = await request.json();
        const {
            name,
            description,
            longDescription,
            category,
            difficulty,
            tags,
            nodesJson,
            edgesJson,
            previewImageUrl,
            screenshots,
            useCases,
            requirements,
            version,
            isPublic = false,
            canvasId,
        } = body;

        let resolvedNodesJson = nodesJson;
        let resolvedEdgesJson = edgesJson;

        // Auto-pull flow data from canvas if canvasId provided
        if (canvasId && (!nodesJson || !edgesJson)) {
            const { canvasRepository } = await import('@/lib/db/repository/canvas.repository');
            const canvas = await canvasRepository.findById(canvasId, session.user.id!);
            if (!canvas) {
                return NextResponse.json({ error: 'Canvas not found' }, { status: 404 });
            }
            try {
                const canvasDataParsed = JSON.parse((canvas as { data?: string }).data || '{}');
                resolvedNodesJson = JSON.stringify(canvasDataParsed.nodes || []);
                resolvedEdgesJson = JSON.stringify(canvasDataParsed.edges || []);
            } catch {
                return NextResponse.json({ error: 'Failed to parse canvas data' }, { status: 400 });
            }
        }

        if (!name || !description || !category || !resolvedNodesJson || !resolvedEdgesJson) {
            return NextResponse.json(
                { error: 'Missing required fields: name, description, category, and flow data' },
                { status: 400 }
            );
        }

        if (!TEMPLATE_CATEGORIES.includes(category)) {
            return NextResponse.json(
                { error: `Invalid category. Must be one of: ${TEMPLATE_CATEGORIES.join(', ')}` },
                { status: 400 }
            );
        }

        const template = new CanvasTemplate({
            name: name.trim(),
            description: description.trim(),
            longDescription: longDescription?.trim(),
            category,
            difficulty: difficulty || 'beginner',
            tags: (tags || []).map((t: string) => t.toLowerCase().trim()),
            nodesJson: resolvedNodesJson,
            edgesJson: resolvedEdgesJson,
            previewImageUrl,
            screenshots: screenshots || [],
            useCases: useCases || [],
            requirements: requirements || [],
            version: version || '1.0.0',
            authorId: session.user.id,
            authorName: session.user.name || 'Anonymous',
            status: isPublic ? 'pending' : 'draft',
            isPublic: false,
            isOfficial: false,
        });

        await template.save();

        return NextResponse.json({
            success: true,
            template: {
                id: template._id,
                name: template.name,
                status: template.status,
            },
            message: isPublic
                ? 'Template submitted for review. We\'ll notify you when it\'s approved.'
                : 'Template saved as draft.',
        });
    } catch (error) {
        console.error('Failed to create template:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to create template' },
            { status: 500 }
        );
    }
}
