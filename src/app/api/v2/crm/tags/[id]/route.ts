import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { tagRepository } from '@/lib/db/repository/crm/tag.repository';
import { updateTagSchema } from '@/validations/crm/tag.schema';
import { z } from 'zod';

/**
 * GET /api/v2/crm/tags/[id]
 * Get a single tag by ID
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
    const tag = await tagRepository.findById(params.id);

    if (!tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    return NextResponse.json(tag);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching tag:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tag', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v2/crm/tags/[id]
 * Update a tag
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
    const validatedData = updateTagSchema.parse(body);

    // Check if tag exists
    const existing = await tagRepository.findById(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    // Check for duplicate name if being updated
    if (validatedData.name && validatedData.name !== existing.name) {
      const duplicate = await tagRepository.findByName(validatedData.name);
      if (duplicate && duplicate._id.toString() !== params.id) {
        return NextResponse.json(
          { error: 'Another tag with this name already exists' },
          { status: 400 }
        );
      }
    }

    // Update tag
    const tag = await tagRepository.update(params.id, validatedData);

    if (!tag) {
      return NextResponse.json({ error: 'Failed to update tag' }, { status: 500 });
    }

    return NextResponse.json(tag);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error updating tag:', error);
    return NextResponse.json(
      { error: 'Failed to update tag', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/crm/tags/[id]
 * Delete a tag
 */
export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

    // Check if tag exists
    const existing = await tagRepository.findById(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    // Delete tag
    const deleted = await tagRepository.delete(params.id);

    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete tag' }, { status: 500 });
    }

    // TODO: Remove this tag from all contacts, companies, and deals
    // This would require additional cleanup logic

    return NextResponse.json({ success: true, message: 'Tag deleted successfully' });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting tag:', error);
    return NextResponse.json(
      { error: 'Failed to delete tag', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
