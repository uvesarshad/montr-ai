import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import RecurringMissionConfig from '@/lib/db/models/recurring-mission-config.model';
import { connectMongoose } from '@/lib/mongodb';

function getOrgId(session: { user?: { id?: string; } } | null) {
  return session?.user?.id || session?.user?.id || '';
}

const createSchema = z.object({
  brandId: z.string().min(1),
  templateId: z.string().min(1),
  name: z.string().min(1).max(100),
  cronExpression: z.string().min(1),
  timezone: z.string().optional(),
  budgetCap: z.number().int().min(0).optional(),
});

/** GET /api/v2/agent/recurring-missions — list for org */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get('brandId') || undefined;

  try {
    await connectMongoose();
    const query: Record<string, unknown> = { };
    if (brandId) query.brandId = brandId;
    const configs = await RecurringMissionConfig.find(query).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ configs });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

/** POST /api/v2/agent/recurring-missions — create */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id!;
  const organizationId = getOrgId(session);

  try {
    const body = createSchema.parse(await request.json());
    await connectMongoose();
    // Calculate first nextRunAt — 1 minute from now as a safe default.
    const nextRunAt = new Date(Date.now() + 60_000);

    const config = await RecurringMissionConfig.create({
      brandId: body.brandId,
      userId,
      templateId: body.templateId,
      name: body.name,
      cronExpression: body.cronExpression,
      timezone: body.timezone ?? 'UTC',
      budgetCap: body.budgetCap ?? 0,
      enabled: true,
      nextRunAt,
      runCount: 0,
    });

    return NextResponse.json(config, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
  }
}
