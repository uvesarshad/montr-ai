import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import CanvasTemplate, { ICanvasTemplate } from '@/lib/db/models/canvas-template.model';
import { canvasRepository } from '@/lib/db/repository/canvas.repository';
import {
    cloneCanvasTemplateFlowData,
    getBuiltInCanvasTemplateById,
} from '@/lib/canvas/template-catalog';

function parseTemplateFlow(nodesJson?: string, edgesJson?: string) {
    let nodes: unknown[] = [];
    let edges: unknown[] = [];
    try {
        const parsed = nodesJson ? JSON.parse(nodesJson) : [];
        nodes = Array.isArray(parsed) ? parsed : [];
    } catch { nodes = []; }
    try {
        const parsed = edgesJson ? JSON.parse(edgesJson) : [];
        edges = Array.isArray(parsed) ? parsed : [];
    } catch { edges = []; }
    return { nodes, edges, variables: [] };
}

async function readOptionalJson(request: NextRequest) {
    try { return await request.json(); } catch { return {}; }
}

// GET - Get single template detail
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();
        await dbConnect();
        const { id } = await params;

        const builtIn = getBuiltInCanvasTemplateById(id);
        if (builtIn) {
            // Increment view count is not applicable for built-ins
            return NextResponse.json({ template: builtIn });
        }

        const template = await CanvasTemplate.findById(id).lean<ICanvasTemplate>();
        if (!template) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        const isOwner = session?.user?.id && template.authorId.toString() === session?.user?.id;
        const isAdmin = session?.user?.role === 'admin' || session?.user?.role === 'super_admin';
        const isPublished = template.status === 'published' && template.isPublic;

        if (!isOwner && !isAdmin && !isPublished) {
            return NextResponse.json({ error: 'Template not accessible' }, { status: 403 });
        }

        // Increment view count asynchronously (don't await)
        CanvasTemplate.findByIdAndUpdate(id, { $inc: { viewCount: 1 } }).exec();

        const flowData = parseTemplateFlow(template.nodesJson, template.edgesJson);

        return NextResponse.json({
            template: {
                _id: template._id.toString(),
                name: template.name,
                description: template.description,
                longDescription: template.longDescription,
                category: template.category,
                difficulty: template.difficulty,
                tags: template.tags || [],
                previewImageUrl: template.previewImageUrl,
                screenshots: template.screenshots || [],
                useCases: template.useCases || [],
                requirements: template.requirements || [],
                compatibleTriggers: template.compatibleTriggers || [],
                version: template.version || '1.0.0',
                authorName: template.authorName || 'Community',
                usageCount: template.usageCount || 0,
                rating: template.rating || 0,
                ratingCount: template.ratingCount || 0,
                viewCount: template.viewCount || 0,
                isFeatured: Boolean(template.isFeatured),
                isOfficial: Boolean(template.isOfficial),
                source: template.isOfficial ? 'official' : 'community',
                isBuiltIn: false,
                stepCount: flowData.nodes.length,
                setupTime: flowData.nodes.length > 0 ? Math.max(flowData.nodes.length * 3, 5) : 5,
                status: template.status,
                rejectionReason: isOwner || isAdmin ? template.rejectionReason : undefined,
                createdAt: template.createdAt ? new Date(template.createdAt).toISOString() : undefined,
                updatedAt: template.updatedAt ? new Date(template.updatedAt).toISOString() : undefined,
                flowData,
            },
        });
    } catch (error) {
        console.error('Failed to fetch template:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) || 'Failed to fetch template' }, { status: 500 });
    }
}

// POST - Install/Use template (creates a new canvas from template)
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
        const body = await readOptionalJson(request);
        const { canvasName } = body;

        const builtIn = getBuiltInCanvasTemplateById(id);
        if (builtIn) {
            const newCanvas = await canvasRepository.create({
                userId: session.user.id,
                name: canvasName || `${builtIn.name} (Copy)`,
                data: JSON.stringify(cloneCanvasTemplateFlowData(builtIn.flowData)),
            });
            return NextResponse.json({
                success: true,
                canvas: { id: newCanvas._id, name: newCanvas.name },
                message: 'Template installed successfully',
            });
        }

        const template = await CanvasTemplate.findById(id);
        if (!template) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        const isOwner = template.authorId.toString() === session.user.id!;
        const isPublished = template.status === 'published' && template.isPublic;

        if (!isOwner && !isPublished) {
            return NextResponse.json({ error: 'Template not accessible' }, { status: 403 });
        }

        const flowData = parseTemplateFlow(template.nodesJson, template.edgesJson);
        const newCanvas = await canvasRepository.create({
            userId: session.user.id,
            name: canvasName || `${template.name} (Copy)`,
            data: JSON.stringify(flowData),
        });

        await CanvasTemplate.findByIdAndUpdate(id, { $inc: { usageCount: 1 } });

        return NextResponse.json({
            success: true,
            canvas: { id: newCanvas._id, name: newCanvas.name },
            message: 'Template installed successfully',
        });
    } catch (error) {
        console.error('Failed to install template:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) || 'Failed to install template' }, { status: 500 });
    }
}

// PUT - Update template (owner only)
export async function PUT(
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
        const template = await CanvasTemplate.findById(id);

        if (!template) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }
        if (template.authorId.toString() !== session.user.id) {
            return NextResponse.json({ error: 'Not authorized to edit this template' }, { status: 403 });
        }

        const body = await request.json();
        const allowed = ['name', 'description', 'longDescription', 'category', 'difficulty', 'tags',
            'previewImageUrl', 'screenshots', 'useCases', 'requirements', 'version'];

        const updates: Record<string, unknown> = {};
        for (const key of allowed) {
            if (body[key] !== undefined) updates[key] = body[key];
        }

        if (body.publish === true && template.status === 'draft') {
            updates.status = 'pending';
        }

        const updated = await CanvasTemplate.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true }
        ).select('-nodesJson -edgesJson');

        return NextResponse.json({ success: true, template: updated });
    } catch (error) {
        console.error('Failed to update template:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) || 'Failed to update template' }, { status: 500 });
    }
}

// DELETE - Delete template (owner only)
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
        const template = await CanvasTemplate.findById(id);

        if (!template) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }
        if (template.authorId.toString() !== session.user.id) {
            return NextResponse.json({ error: 'Not authorized to delete this template' }, { status: 403 });
        }

        await CanvasTemplate.findByIdAndDelete(id);

        return NextResponse.json({ success: true, message: 'Template deleted' });
    } catch (error) {
        console.error('Failed to delete template:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) || 'Failed to delete template' }, { status: 500 });
    }
}
