/**
 * POST /api/v2/voice/livekit/token
 *
 * Mints a browser LiveKit access token for an in-app TEST call. The browser
 * joins a room (= the call/tenant boundary) as a publish+subscribe participant;
 * a future agent leg joins the same room via the bridge (Phase 8 stub).
 *
 * Flow:
 *   1. 🔒 `requireOrgUser` — org is read from the session user's DB record,
 *      NEVER from the request body.
 *   2. Accept an existing `callSessionId` (must belong to the org) OR create a
 *      lightweight `in-house` test call session.
 *   3. Ensure the room exists, mint a room-scoped token with tenancy metadata.
 *   4. Return `{ url, token, roomName, callSessionId }`.
 *
 * Returns 501 when LiveKit isn't configured (no env / no running server).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireOrgUser } from '@/lib/voice/api-helpers';
import { callSessionRepository } from '@/lib/db/repository/voice';
import {
  isLiveKitConfigured,
  getLiveKitClientUrl,
  mintAccessToken,
  roomNameForCall,
  ensureRoom,
} from '@/lib/voice/livekit';

const bodySchema = z.object({
  /** Reuse an existing call session (must belong to the caller's org). */
  callSessionId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  /** Brand scope for a freshly-created test session. */
  brandId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
});

export async function POST(request: NextRequest) {
  const authed = await requireOrgUser();
  if (authed instanceof NextResponse) return authed;
  const { userId } = authed;

  if (!isLiveKitConfigured()) {
    return NextResponse.json(
      {
        error: 'LiveKit not configured',
        message:
          'Set LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET and run a LiveKit server. ' +
          'See docs/plan/livekit-deployment-gap-2026-06-12.md.',
      },
      { status: 501 },
    );
  }

  let input: z.infer<typeof bodySchema>;
  try {
    input = bodySchema.parse(await request.json().catch(() => ({})));
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: err.errors }, { status: 400 });
    }
    throw err;
  }

  // 1) Resolve or create the call session (🔒 org-scoped).
  let callSessionId: string;
  if (input.callSessionId) {
    const existing = await callSessionRepository.findById(input.callSessionId);
    if (!existing) {
      return NextResponse.json({ error: 'Call session not found' }, { status: 404 });
    }
    callSessionId = String(existing._id);
  } else {
    const created = await callSessionRepository.create({
      brandId: input.brandId ?? null,
      // In-house WebRTC test call — no telephony provider involved.
      providerId: 'in-house',
      providerCallId: `livekit-test-${Date.now()}`,
      direction: 'outbound',
      fromNumber: 'livekit-browser',
      toNumber: 'livekit-room',
      initiatorType: 'user',
      initiatorId: userId,
      status: 'initiated',
      customMetadata: { transport: 'livekit', test: true },
    });
    callSessionId = String(created._id);
  }

  const roomName = roomNameForCall(callSessionId);

  // 2) Ensure the room exists (idempotent; null-safe). Best-effort — LiveKit
  //    auto-creates on first join, so a failure here isn't fatal.
  await ensureRoom(roomName, {
    maxParticipants: 2,
    emptyTimeoutSec: 5 * 60,
    metadata: JSON.stringify({ callSessionId }),
  }).catch(() => { /* best-effort — token still valid; room auto-creates on join */ });

  // 3) Mint the browser token (publish + subscribe).
  const minted = await mintAccessToken({
    brandId: input.brandId ?? null,
    callSessionId,
    identity: `user:${userId}`,
    roomName,
    canPublish: true,
    canSubscribe: true,
    name: 'Browser test caller',
  });

  if (!minted) {
    // Shouldn't happen (we checked isLiveKitConfigured), but stay null-safe.
    return NextResponse.json({ error: 'LiveKit not configured' }, { status: 501 });
  }

  return NextResponse.json({
    url: getLiveKitClientUrl(),
    token: minted.token,
    roomName: minted.roomName,
    callSessionId,
    identity: minted.identity,
  });
}
