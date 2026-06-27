import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { blocklistRepository } from '@/lib/db/repository/crm/blocklist.repository';
import { createBlocklistSchema } from '@/validations/crm/blocklist.schema';

function serialize(doc: {
  _id: { toString(): string };
  pattern: string;
  reason?: string;
  createdAt: Date;
}) {
  return {
    id: doc._id.toString(),
    pattern: doc.pattern,
    reason: doc.reason,
    createdAt: doc.createdAt,
  };
}

// GET /api/v2/crm/blocklist - List sender blocklist patterns
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await userRepository.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const entries = await blocklistRepository.list();

    return NextResponse.json({ data: entries.map(serialize) });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching blocklist:', error);
    return NextResponse.json({ error: 'Failed to fetch blocklist' }, { status: 500 });
  }
}

// POST /api/v2/crm/blocklist - Add a sender pattern to the blocklist
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await userRepository.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const ctx = await getCrmPermissionContext(session.user.id);
    assertCanManageSettings(ctx);
    const body = await request.json();
    const { pattern, reason } = createBlocklistSchema.parse(body);

    // Avoid duplicate-key error surfacing as a 500.
    const existing = await blocklistRepository.list();
    if (existing.some((e) => e.pattern === pattern)) {
      return NextResponse.json({ error: 'Pattern already blocked' }, { status: 409 });
    }

    const entry = await blocklistRepository.create({
      pattern,
      reason,
      createdById: session.user.id,
    });

    return NextResponse.json({ data: serialize(entry) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error creating blocklist entry:', error);
    return NextResponse.json({ error: 'Failed to create blocklist entry' }, { status: 500 });
  }
}
