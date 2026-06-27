import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { companyRepository } from '@/lib/db/repository/crm/company.repository';
import { activityRepository } from '@/lib/db/repository/crm/activity.repository';
import type { ActivityType } from '@/lib/db/models/crm/activity.model';

/**
 * GET /api/v2/crm/companies/[id]/activities
 * Get all activities for a company
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    assertCrmPermission(await getCrmPermissionContext(userId), 'activity', 'read');
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    // Check if company exists
    const company = await companyRepository.findById(params.id);
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100);
    const type = searchParams.get('type') || undefined;

    // Fetch activities
    const activities = await activityRepository.findByCompany(
      params.id,
      type as ActivityType | undefined,
      { page, limit }
    );

    return NextResponse.json(activities);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching company activities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activities', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
