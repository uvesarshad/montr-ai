import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import MissionTrigger from '@/lib/db/models/mission-trigger.model';
import { connectMongoose } from '@/lib/mongodb';

function getOrgId(session: { user?: { id?: string; } } | null) {
  return session?.user?.id || session?.user?.id || '';
}

const TRIGGER_EVENT_TYPES = [
  'form.submitted',
  'contact.created',
  'deal.stage_changed',
  'deal.won',
  'deal.lost',
  'email.received',
  'campaign.completed',
] as const;

const createSchema = z.object({
  brandId: z.string().min(1),
  templateId: z.string().min(1),
  name: z.string().min(1).max(100),
  eventType: z.enum(TRIGGER_EVENT_TYPES),
  conditions: z.string().optional(),
});

/** GET /api/v2/agent/mission-triggers */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get('brandId') || undefined;

  try {
    await connectMongoose();
    const query: Record<string, unknown> = { };
    if (brandId) query.brandId = brandId;
    const triggers = await MissionTrigger.find(query).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ triggers });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

/** POST /api/v2/agent/mission-triggers */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id!;
  const organizationId = getOrgId(session);

  try {
    const body = createSchema.parse(await request.json());
    await connectMongoose();
    const trigger = await MissionTrigger.create({
      brandId: body.brandId,
      userId,
      templateId: body.templateId,
      name: body.name,
      eventType: body.eventType,
      conditions: body.conditions ?? null,
      enabled: true,
      triggerCount: 0,
    });

    return NextResponse.json(trigger, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 });
  }
}
