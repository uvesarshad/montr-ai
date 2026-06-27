/**
 * AI Bots CRUD — list and create (B3-4.5.5).
 *
 * Sub-routes (per-bot get/update/delete/test) live under `[id]/`.
 *
 * Notes: existing `[id]/conversations` and `[id]/stats` routes are legacy
 * (WhatsApp-only chatbot scope) and continue to coexist.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';

import { getSession } from '@/lib/get-session';
import { aiBotRepository } from '@/lib/db/repository/ai-bot.repository';
import { createAiBotSchema } from '@/validations/ai-bot.schema';
import { AdminAuditLogRepository } from '@/lib/db/repository/admin-audit-log.repository';

interface SessionUser {
  id?: string;
  email?: string;
}

const auditRepo = new AdminAuditLogRepository();

export async function GET(req: NextRequest) {
  const session = await getSession();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const brandIdRaw = searchParams.get('brandId');
  const channel = searchParams.get('channel') as 'whatsapp' | 'inbox' | 'voice' | null;
  const status = searchParams.get('status') as 'active' | 'archived' | null;
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 50)));

  const brandId =
    brandIdRaw === 'null' || brandIdRaw === ''
      ? null
      : brandIdRaw && Types.ObjectId.isValid(brandIdRaw)
        ? brandIdRaw
        : undefined;

  try {
    const bots = await aiBotRepository.list({
      brandId,
      channel: channel ?? undefined,
      status: status ?? undefined,
      limit,
      skip: (page - 1) * limit,
    });
    return NextResponse.json({ data: bots, pagination: { page, limit, returned: bots.length } });
  } catch (err) {
    console.error('[ai-bots.GET]', err);
    return NextResponse.json({ error: 'Failed to list bots' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createAiBotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const bot = await aiBotRepository.create({
      ...parsed.data,
      createdById: user.id,
    });

    void auditRepo.record({
      actorUserId: user.id,
      actorEmail: user.email,
      entity: 'ai_bot',
      entityId: String(bot._id),
      action: 'create',
      context: {
        name: bot.name,
        enabledChannels: bot.enabledChannels,
        brandId: bot.brandId ? String(bot.brandId) : null,
      },
      ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: bot }, { status: 201 });
  } catch (err) {
    console.error('[ai-bots.POST]', err);
    return NextResponse.json({ error: 'Failed to create bot' }, { status: 500 });
  }
}
