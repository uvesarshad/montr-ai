/**
 * AI Bot detail — GET / PATCH / DELETE (B3-4.5.5).
 */

import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';

import { getSession } from '@/lib/get-session';
import { aiBotRepository } from '@/lib/db/repository/ai-bot.repository';
import { updateAiBotSchema } from '@/validations/ai-bot.schema';
import { AdminAuditLogRepository } from '@/lib/db/repository/admin-audit-log.repository';

interface SessionUser {
  id?: string;
  email?: string;
}

const auditRepo = new AdminAuditLogRepository();

async function loadOwned(
  id: string
) {
  if (!Types.ObjectId.isValid(id)) return null;
  const bot = await aiBotRepository.findById(id);
  if (!bot) return null;
  return bot;
}

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bot = await loadOwned(params.id);
  if (!bot) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ data: bot });
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const existing = await loadOwned(params.id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = updateAiBotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const updated = await aiBotRepository.update(params.id, parsed.data);

    void auditRepo.record({
      actorUserId: user.id,
      actorEmail: user.email,
      entity: 'ai_bot',
      entityId: params.id,
      action: 'update',
      context: { fieldsChanged: Object.keys(parsed.data) },
      ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('[ai-bots.PATCH]', err);
    return NextResponse.json({ error: 'Failed to update bot' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const existing = await loadOwned(params.id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    // Default to archive (preserves audit). Add ?hard=true to actually delete.
    const { searchParams } = new URL(req.url);
    const hard = searchParams.get('hard') === 'true';
    if (hard) {
      await aiBotRepository.delete(params.id);
    } else {
      await aiBotRepository.archive(params.id);
    }

    void auditRepo.record({
      actorUserId: user.id,
      actorEmail: user.email,
      entity: 'ai_bot',
      entityId: params.id,
      action: hard ? 'delete' : 'disable',
      context: { name: existing.name, hard },
      ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[ai-bots.DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete bot' }, { status: 500 });
  }
}
