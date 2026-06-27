import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { tagRepository } from '@/lib/db/repository/crm/tag.repository';
import { createTagSchema } from '@/validations/crm/tag.schema';
import { z } from 'zod';

/**
 * GET /api/v2/crm/tags
 * List all tags for the organization
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const type = searchParams.get('type') as 'contact' | 'company' | 'deal' | 'all' | undefined;

    // Fetch all tags (tags are typically small in number, no pagination needed)
    const tags = await tagRepository.findAll(type);

    return NextResponse.json({ data: tags, total: tags.length });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching tags:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tags', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v2/crm/tags
 * Create a new tag
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const ctx = await getCrmPermissionContext(userId);
    assertCanManageSettings(ctx);
    const body = await request.json();

    // Validate input
    const validatedData = createTagSchema.parse(body);

    // Check for duplicate tag name
    const existing = await tagRepository.findByName(validatedData.name);
    if (existing) {
      return NextResponse.json(
        { error: 'Tag with this name already exists' },
        { status: 400 }
      );
    }

    // Create tag
    const tag = await tagRepository.create({
      ...validatedData,
      createdById: userId,
    });

    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error creating tag:', error);
    return NextResponse.json(
      { error: 'Failed to create tag', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
