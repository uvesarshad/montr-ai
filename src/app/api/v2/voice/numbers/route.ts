/**
 * Voice phone number management.
 *
 *   GET  /api/v2/voice/numbers — list owned numbers (filterable by brand).
 *   POST /api/v2/voice/numbers/provision — request a new number from provider.
 *
 * The provision endpoint is a thin wrapper: each provider implements its own
 * search + buy semantics, which differ enough that we hand the work off to a
 * dedicated module. For now, only Twilio is supported; Plivo/Telnyx slot in
 * when those provider impls land.
 */

import { NextRequest, NextResponse } from 'next/server';

import { voicePhoneNumberRepository } from '@/lib/db/repository/voice';
import { requireOrgUser } from '@/lib/voice/api-helpers';

export async function GET(request: NextRequest) {
  const authResult = await requireOrgUser();
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = new URL(request.url);
  const brandIdParam = searchParams.get('brandId');
  const providerId = searchParams.get('providerId') ?? undefined;
  const status = (searchParams.get('status') ?? undefined) as
    | 'active'
    | 'suspended'
    | 'released'
    | undefined;
  const search = searchParams.get('search') ?? undefined;

  const numbers = await voicePhoneNumberRepository.list({
    brandId: brandIdParam === 'null' ? null : brandIdParam ?? undefined,
    providerId: providerId as 'twilio' | 'plivo' | 'telnyx' | 'in-house' | undefined,
    status,
    search,
  });

  return NextResponse.json({ data: numbers });
}

// POST /api/v2/voice/numbers — sub-routes handle provisioning; this endpoint
// rejects direct POSTs to avoid surprising the user.
export async function POST() {
  return NextResponse.json(
    {
      error: 'Use POST /api/v2/voice/numbers/provision to acquire a new number',
    },
    { status: 405 },
  );
}

export const dynamic = 'force-dynamic';
