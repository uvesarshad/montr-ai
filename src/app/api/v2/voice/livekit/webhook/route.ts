/**
 * POST /api/v2/voice/livekit/webhook
 *
 * Receives LiveKit server webhooks (room_started, participant_joined/left, …).
 * Verifies the signature via `verifyLiveKitWebhook`, normalizes the event, and
 * acks. Intentionally DECOUPLED from the conversation engine — it only logs /
 * could broadcast. Engine coupling is the bridge's job (Phase 8 stub).
 *
 * This route reads tenancy from the verified event (room name → callSessionId,
 * participant metadata → org/brand), never from an unauthenticated body — the
 * webhook is authenticated by LiveKit's signed `Authorization` JWT.
 *
 * Returns 501 when LiveKit isn't configured. We do NOT call `requireOrgUser`
 * here: LiveKit (a server) is the caller, authenticated by signature, not a
 * logged-in user session.
 */

import { NextRequest, NextResponse } from 'next/server';

import { isLiveKitConfigured, verifyLiveKitWebhook } from '@/lib/voice/livekit';

export async function POST(request: NextRequest) {
  if (!isLiveKitConfigured()) {
    return NextResponse.json({ error: 'LiveKit not configured' }, { status: 501 });
  }

  // The signature covers the RAW body bytes — read text, never re-stringify.
  const rawBody = await request.text();
  const authHeader = request.headers.get('authorization');

  const result = await verifyLiveKitWebhook(rawBody, authHeader);
  if (!result.ok) {
    // Don't leak the reason to the caller; log it server-side.
    console.warn('[livekit-webhook] verification failed:', result.reason);
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 401 });
  }

  const ev = result.event!;
  // Minimal handling: log. A later phase can broadcast to `global.io` on a
  // `voice:call:<callSessionId>` room, or drive call_session status, etc.
  console.log(
    `[livekit-webhook] ${ev.kind} room=${ev.roomName ?? '-'} ` +
      `call=${ev.callSessionId ?? '-'} org=${'-'} ` +
      `participant=${ev.participantIdentity ?? '-'}`,
  );

  // TODO(phase-9): broadcast normalized events to the call's socket room +
  // reflect participant_joined/left into call_session status. Kept out of scope
  // here to honor the "no engine coupling" constraint.

  return NextResponse.json({ received: true });
}
