import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { viewRepository } from '@/lib/db/repository/crm/view.repository';
import { createViewSchema } from '@/validations/crm/view.schema';
import { z } from 'zod';

/**
 * GET /api/v2/crm/views
 * List views for the user/organization with optional filters
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
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'read');
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const entityType = searchParams.get('entityType') as 'contact' | 'company' | 'deal' | 'activity' | null;
    const shared = searchParams.get('shared');
    const pinned = searchParams.get('pinned');

    let views;

    if (entityType) {
      // Get views filtered by entity type
      views = await viewRepository.findByEntityType(entityType, userId);
    } else {
      // Get all views accessible to the user
      views = await viewRepository.findUserViews(userId);
    }

    // Apply additional filters
    if (shared !== null) {
      const isShared = shared === 'true';
      views = views.filter(view =>
        isShared ? view.visibility !== 'private' : view.visibility === 'private'
      );
    }

    if (pinned !== null) {
      const isPinned = pinned === 'true';
      views = views.filter(view => view.isPinned === isPinned);
    }

    return NextResponse.json({ data: views, total: views.length });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching views:', error);
    return NextResponse.json(
      { error: 'Failed to fetch views', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v2/crm/views
 * Create a new view
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
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'read');
    const body = await request.json();

    // Validate input
    const validatedData = createViewSchema.parse(body);

    // Create view
    const view = await viewRepository.create({
      ...validatedData,
      createdById: userId,
    });

    return NextResponse.json(view, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error creating view:', error);
    return NextResponse.json(
      { error: 'Failed to create view', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
