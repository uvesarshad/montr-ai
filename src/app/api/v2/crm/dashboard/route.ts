import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { crmDashboardRepository } from '@/lib/db/repository/crm/crm-dashboard.repository';
import { defaultDashboard, mergeDashboard } from '@/components/crm/dashboard/widget-catalog';
import { updateCrmDashboardSchema } from '@/validations/crm/crm-dashboard.schema';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { z } from 'zod';

async function resolveCtx() {
  const session = await getSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return { error: 'Unauthorized', status: 401 as const };
  return { userId };
}

/**
 * GET /api/v2/crm/dashboard
 * Returns the effective per-user dashboard (saved merged with catalog, or
 * defaults) plus an `isDefault` flag indicating no saved dashboard exists.
 */
export async function GET() {
  try {
    const ctx = await resolveCtx();
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    assertCrmPermission(await getCrmPermissionContext(ctx.userId), 'contact', 'read');

    const saved = await crmDashboardRepository.get(ctx.userId);
    const isDefault = !saved || saved.widgets.length === 0;
    const widgets = isDefault
      ? defaultDashboard()
      : mergeDashboard(
          saved.widgets.map((w) => ({ key: w.key, visible: w.visible, order: w.order }))
        );

    return NextResponse.json({ widgets, isDefault });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching CRM dashboard:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard' }, { status: 500 });
  }
}

/**
 * PUT /api/v2/crm/dashboard
 * Upserts the user's CRM overview dashboard.
 */
export async function PUT(request: NextRequest) {
  try {
    const ctx = await resolveCtx();
    if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const body = await request.json();
    const data = updateCrmDashboardSchema.parse(body);

    const doc = await crmDashboardRepository.upsert({
      userId: ctx.userId,
      widgets: data.widgets,
    });

    const widgets = mergeDashboard(
      (doc.widgets ?? data.widgets).map((w) => ({
        key: w.key,
        visible: w.visible,
        order: w.order,
      }))
    );

    return NextResponse.json({ widgets, isDefault: false });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error saving CRM dashboard:', error);
    return NextResponse.json({ error: 'Failed to save dashboard' }, { status: 500 });
  }
}
