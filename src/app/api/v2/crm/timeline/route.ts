import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { activityRepository, ActivityFilters } from '@/lib/db/repository/crm/activity.repository';
import type { ActivityType } from '@/lib/db/models/crm/activity.model';

/**
 * GET /api/v2/crm/timeline
 * Get unified timeline of activities for a target (contact, company, or deal)
 * This endpoint aggregates all activities related to a specific record
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    const ctx = await getCrmPermissionContext(userId);
    assertCrmPermission(ctx, 'contact', 'read');
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);

    // Parse required parameters
    const targetType = searchParams.get('targetType');
    const targetId = searchParams.get('targetId');

    if (!targetType || !targetId) {
      return NextResponse.json(
        { error: 'targetType and targetId are required' },
        { status: 400 }
      );
    }

    if (!['contact', 'company', 'deal'].includes(targetType)) {
      return NextResponse.json(
        { error: 'targetType must be contact, company, or deal' },
        { status: 400 }
      );
    }

    // Parse query parameters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);

    // Parse optional filters
    const filters: ActivityFilters = {
      targetType: targetType as 'contact' | 'company' | 'deal',
      targetId,
    };

    // Filter by activity types if specified
    const types = searchParams.get('types');
    if (types) {
      filters.type = types.split(',') as ActivityType[];
    }

    // Filter by date range if specified
    const createdAfter = searchParams.get('createdAfter');
    if (createdAfter) {
      filters.createdAfter = new Date(createdAfter);
    }

    const createdBefore = searchParams.get('createdBefore');
    if (createdBefore) {
      filters.createdBefore = new Date(createdBefore);
    }

    // Fetch timeline (always sorted by createdAt descending)
    const result = await activityRepository.find(filters, {
      page,
      limit,
      sort: 'createdAt',
      sortDirection: 'desc',
    });

    return NextResponse.json(result);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching timeline:', error);
    return NextResponse.json(
      { error: 'Failed to fetch timeline', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
