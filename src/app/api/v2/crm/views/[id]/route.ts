import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { viewRepository } from '@/lib/db/repository/crm/view.repository';
import { updateViewSchema } from '@/validations/crm/view.schema';
import { z } from 'zod';

/**
 * GET /api/v2/crm/views/[id]
 * Get a single view by ID
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
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'read');
    const view = await viewRepository.findById(params.id);

    if (!view) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 });
    }

    // Check if user has access to this view
    const hasAccess =
      view.visibility === 'organization' ||
      (view.visibility === 'team' && view.sharedWith.some(id => id.toString() === userId)) ||
      view.ownerId.toString() === userId;

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json(view);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching view:', error);
    return NextResponse.json(
      { error: 'Failed to fetch view', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v2/crm/views/[id]
 * Update a view
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
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'read');
    const view = await viewRepository.findById(params.id);

    if (!view) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 });
    }

    // Only owner can update the view
    if (view.ownerId.toString() !== userId) {
      return NextResponse.json(
        { error: 'Only the view owner can update it' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate input
    const validatedData = updateViewSchema.parse(body);

    // Update view
    const updatedView = await viewRepository.update(
      params.id,
      validatedData
    );

    if (!updatedView) {
      return NextResponse.json({ error: 'Failed to update view' }, { status: 500 });
    }

    return NextResponse.json(updatedView);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error updating view:', error);
    return NextResponse.json(
      { error: 'Failed to update view', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/crm/views/[id]
 * Delete a view
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
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'read');
    const view = await viewRepository.findById(params.id);

    if (!view) {
      return NextResponse.json({ error: 'View not found' }, { status: 404 });
    }

    // Only owner can delete the view
    if (view.ownerId.toString() !== userId) {
      return NextResponse.json(
        { error: 'Only the view owner can delete it' },
        { status: 403 }
      );
    }

    const deleted = await viewRepository.delete(params.id);

    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete view' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting view:', error);
    return NextResponse.json(
      { error: 'Failed to delete view', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
