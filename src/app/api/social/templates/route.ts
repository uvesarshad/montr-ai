import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import { postTemplateRepository } from '@/lib/db/repository/post-template.repository';
import { assertBrandAccess, BrandAccessError, brandAccessErrorResponse } from '@/lib/social/brand-access';

const createTemplateSchema = z.object({
    brandId: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    content: z.string().min(1),
    media: z.any().optional(),
    platforms: z.any().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    isPublic: z.boolean().optional(),
});

const updateTemplateSchema = z
    .object({ templateId: z.string().min(1) })
    .passthrough();

/**
 * GET /api/social/templates
 * List templates for brand
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const brandId = searchParams.get('brandId');
        const category = searchParams.get('category');
        const search = searchParams.get('search');

        if (!brandId) {
            return NextResponse.json({ error: 'brandId required' }, { status: 400 });
        }

        // Tenancy: confirm the brand belongs to the caller (audit C4).
        try {
            await assertBrandAccess(session.user.id, brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        let templates;
        if (search) {
            templates = await postTemplateRepository.search(brandId, search);
        } else {
            templates = await postTemplateRepository.findByBrand(brandId, category || undefined);
        }

        const categories = await postTemplateRepository.getCategories(brandId);

        return NextResponse.json({ templates, categories });
    } catch (error) {
        console.error('Error fetching templates:', error);
        return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }
}

/**
 * POST /api/social/templates
 * Create a new template
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const parsed = createTemplateSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }
        const { brandId, name, description, content, media, platforms, category, tags, isPublic } = parsed.data;

        // Tenancy: confirm the brand belongs to the caller (audit C4).
        try {
            ({ } = await assertBrandAccess(session.user.id, brandId));
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        // Plan enforcement: org-wide template cap (audit B3).
        const template = await postTemplateRepository.create({
            brandId,
            userId: session.user.id,
            name,
            description,
            content,
            media,
            platforms,
            category,
            tags,
            isPublic,
        });

        return NextResponse.json({ template }, { status: 201 });
    } catch (error) {
        console.error('Error creating template:', error);
        return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
    }
}

/**
 * PATCH /api/social/templates
 * Update a template
 */
export async function PATCH(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const parsed = updateTemplateSchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json({ error: 'templateId required' }, { status: 400 });
        }
        const { templateId, ...updates } = parsed.data;

        // Tenancy: load the template and confirm its brand belongs to the caller (audit C4).
        const existing = await postTemplateRepository.findById(templateId);
        if (!existing) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }
        try {
            await assertBrandAccess(session.user.id, existing.brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        const template = await postTemplateRepository.update(
            templateId,
            updates as Parameters<typeof postTemplateRepository.update>[1]
        );
        if (!template) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        return NextResponse.json({ template });
    } catch (error) {
        console.error('Error updating template:', error);
        return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
    }
}

/**
 * DELETE /api/social/templates
 * Delete a template
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const templateId = searchParams.get('id');

        if (!templateId) {
            return NextResponse.json({ error: 'Template ID required' }, { status: 400 });
        }

        // Tenancy: load the template and confirm its brand belongs to the caller (audit C4).
        const existing = await postTemplateRepository.findById(templateId);
        if (!existing) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }
        try {
            await assertBrandAccess(session.user.id, existing.brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        const deleted = await postTemplateRepository.delete(templateId);
        if (!deleted) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting template:', error);
        return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
    }
}
