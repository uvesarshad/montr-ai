/**
 * Provider webhook receiver.
 *
 * Single catch-all per provider — Twilio status callbacks, recording callbacks,
 * inbound call answer URLs, etc. all hit
 *   POST /api/v2/voice/webhooks/[provider]/[...path]
 *
 * The `path` segment carries the routing key the outbound dialer encoded into
 * the callback URL (e.g. `status/<callSessionId>`, `answer/<callSessionId>`).
 *
 * Flow:
 *   1. Identify the call session this webhook is about (path or payload).
 *   2. Load the provider config used to place the call, decrypt credentials.
 *   3. Verify the webhook signature using the provider impl.
 *   4. Normalize payload → `VoiceEvent[]` via `provider.handleInboundWebhook`.
 *   5. Persist session updates + emit Socket.io events.
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  callSessionRepository,
  voiceProviderConfigRepository,
} from '@/lib/db/repository/voice';
import { getVoiceProvider } from '@/lib/voice';
import { initVoiceSubsystem } from '@/lib/voice/bootstrap';
import type {
  VoiceEvent,
  VoiceProviderCredential,
  VoiceProviderId,
} from '@/lib/voice/types';
import { broadcastVoiceEvent } from '@/lib/voice/events';
import { dispatchTrigger } from '@/lib/workflow/triggers/dispatch';
import VoiceBulkBatch from '@/lib/db/models/voice/voice-bulk-batch.model';
import { resumePausedExecutionsForEvent } from '@/lib/workflow/triggers/event-resumer';
import { publishDomainEvent } from '@/lib/events/domain-bus';

initVoiceSubsystem();

interface Ctx {
  params: Promise<{ provider: string; path: string[] }>;
}

function isVoiceProviderId(value: string): value is VoiceProviderId {
  return value === 'twilio' || value === 'plivo' || value === 'telnyx' || value === 'in-house';
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const { provider: providerParam, path } = await ctx.params;

  if (!isVoiceProviderId(providerParam)) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 404 });
  }

  const provider = getVoiceProvider(providerParam);
  if (!provider) {
    return NextResponse.json({ error: 'Provider not registered' }, { status: 503 });
  }

  // The first path segment is the webhook kind, the second is our session id
  // (when the outbound dialer encoded it).
  const callSessionId = path?.[1];
  let credential: VoiceProviderCredential | null = null;
  let session = null;

  if (callSessionId) {
    // We don't yet know the organizationId from the URL; the session id is the
    // only thing we have. So we look it up across orgs — webhook URLs are
    // unguessable enough (32 hex chars) to be treated as bearer-equivalent
    // until signature verification confirms the provider sent them.
    const found = await callSessionRepository.findByProviderCallId(
      providerParam,
      callSessionId,
    );
    session = found;
    if (found?.providerConfigId) {
      const configDoc = await voiceProviderConfigRepository.findById(
        found.providerConfigId.toString(),
      );
      if (configDoc) {
        credential = {
          providerId: configDoc.providerId,
          name: configDoc.displayName,
          type: 'custom',
          encryptedValue: configDoc.encryptedValue,
          iv: configDoc.iv,
          authTag: configDoc.authTag,
          salt: configDoc.salt,
          metadata: {
            ...(configDoc.metadata ?? {}),
            userId: configDoc.ownerUserId.toString(),
          },
        };
      }
    }
  }

  // Fallback to the system credential if we couldn't tie this webhook to a
  // specific session (e.g. inbound calls hitting a number for the first time).
  if (!credential) {
    credential = await voiceProviderConfigRepository.findSystemCredential();
  }
  if (!credential) {
    return NextResponse.json({ error: 'No credential available to verify' }, { status: 503 });
  }

  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const verification = provider.verifyWebhookSignature(
    {
      rawBody,
      headers,
      signature: headers['x-twilio-signature'] ?? headers['x-signature'],
      url: request.url,
    },
    credential,
  );

  if (!verification.valid) {
    // Log reason internally; never echo to the client.
    console.warn(
      `[voice-webhook] signature failed for ${providerParam}: ${verification.reason}`,
    );
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let events: VoiceEvent[] = [];
  try {
    events = await provider.handleInboundWebhook({
      rawBody,
      headers,
      url: request.url,
    });
  } catch (err) {
    console.error('[voice-webhook] handler threw:', err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  // Apply events to the session row and broadcast.
  for (const event of events) {
    if (!session) {
      session = await callSessionRepository.findByProviderCallId(
        providerParam,
        event.providerCallId,
      );
    }
    if (!session) continue;

    const sessionId = session._id?.toString();
    if (!sessionId) continue;

    switch (event.type) {
      case 'call.initiated':
        await callSessionRepository.updateStatus(sessionId, { status: 'initiated' });
        void publishDomainEvent({
          type: 'voice.call_initiated',
          brandId: session.brandId?.toString(),
          source: 'voice-webhook',
          payload: {
            callSessionId: sessionId,
            providerCallId: event.providerCallId,
            direction: session.direction,
            fromNumber: session.fromNumber,
            toNumber: session.toNumber,
            fromContactId: session.fromContactId?.toString(),
          },
        });
        break;
      case 'call.ringing':
        await callSessionRepository.updateStatus(sessionId, { status: 'ringing' });
        break;
      case 'call.answered':
        await callSessionRepository.updateStatus(sessionId, {
          status: 'answered',
          answeredAt: event.at,
        });
        void publishDomainEvent({
          type: 'voice.call_answered',
          brandId: session.brandId?.toString(),
          source: 'voice-webhook',
          payload: {
            callSessionId: sessionId,
            providerCallId: event.providerCallId,
            answeredAt: event.at,
          },
        });
        break;
      case 'call.completed':
        await callSessionRepository.updateStatus(sessionId, {
          status: 'completed',
          endedAt: event.at,
          durationSec: event.durationSec,
          // Preserve a voicemail verdict already set by answering-machine
          // detection; don't clobber it with the generic 'completed'.
          endReason: session.endReason === 'voicemail' ? 'voicemail' : 'completed',
        });
        // Reflect completion on the bulk batch entry if this call belongs to
        // one. Index the entry by callSessionId to avoid string mismatches.
        try {
          const bulkBatchId = (session.customMetadata as Record<string, unknown> | undefined)?.bulkBatchId;
          if (typeof bulkBatchId === 'string') {
            // Only settle an entry that's still in-flight — if AMD already moved
            // it to 'voicemail', leave it (so the campaign engine can retry it).
            await VoiceBulkBatch.updateOne(
              {
                _id: bulkBatchId,
                entries: { $elemMatch: { callSessionId: session._id, status: { $in: ['in_progress', 'placing'] } } },
              },
              {
                $set: {
                  'entries.$.status': 'completed',
                  'entries.$.endedAt': event.at,
                  'entries.$.durationSec': event.durationSec,
                },
                $inc: {
                  'totals.inProgress': -1,
                  'totals.completed': 1,
                },
              },
            );
          }
        } catch (err) {
          console.error('[voice-webhook] bulk batch update failed:', err);
        }
        // Fire workflow trigger.
        try {
          await dispatchTrigger({
            kind: 'call_completed',
            callSessionId: sessionId,
            providerCallId: event.providerCallId,
            direction: session.direction,
            fromNumber: session.fromNumber,
            toNumber: session.toNumber,
            fromContactId: session.fromContactId?.toString(),
            toContactId: session.toContactId?.toString(),
            durationSec: event.durationSec,
            recordingUrl: session.recordingUrl ?? undefined,
            transcriptId: session.transcriptId?.toString(),
            phoneNumberId: session.phoneNumberId?.toString(),
            brandId: session.brandId?.toString(),
          });
        } catch (err) {
          console.error('[voice-webhook] call_completed dispatch failed:', err);
        }
        // Resume any wait-for-call-response paused executions matching this contact.
        try {
          const contactKey = session.fromContactId?.toString()
            ?? session.toContactId?.toString();
          if (contactKey) {
            await resumePausedExecutionsForEvent({
              kind: 'voice.call_completed',
              key: contactKey,
              payload: {
                callSessionId: sessionId,
                durationSec: event.durationSec,
                recordingUrl: session.recordingUrl ?? undefined,
                transcriptId: session.transcriptId?.toString(),
              },
            });
          }
        } catch (err) {
          console.error('[voice-webhook] paused-execution resume failed:', err);
        }
        // Publish domain event.
        void publishDomainEvent({
          type: 'voice.call_completed',
          brandId: session.brandId?.toString(),
          source: 'voice-webhook',
          payload: {
            callSessionId: sessionId,
            providerCallId: event.providerCallId,
            direction: session.direction,
            durationSec: event.durationSec,
            fromContactId: session.fromContactId?.toString(),
            toContactId: session.toContactId?.toString(),
            recordingUrl: session.recordingUrl ?? undefined,
            transcriptId: session.transcriptId?.toString(),
            endedAt: event.at,
          },
        });
        break;
      case 'call.failed':
        await callSessionRepository.updateStatus(sessionId, {
          status: 'failed',
          endedAt: event.at,
          endReason: 'failed',
          errorCode: event.errorCode,
          errorMessage: event.errorMessage,
        });
        void publishDomainEvent({
          type: 'voice.call_failed',
          brandId: session.brandId?.toString(),
          source: 'voice-webhook',
          payload: {
            callSessionId: sessionId,
            providerCallId: event.providerCallId,
            errorCode: event.errorCode,
            errorMessage: event.errorMessage,
          },
        });
        break;
      case 'recording.available':
        await callSessionRepository.updateStatus(sessionId, {
          recordingUrl: event.recordingUrl,
          recordingDurationSec: event.durationSec,
        });
        void publishDomainEvent({
          type: 'voice.recording_available',
          brandId: session.brandId?.toString(),
          source: 'voice-webhook',
          payload: {
            callSessionId: sessionId,
            providerCallId: event.providerCallId,
            recordingUrl: event.recordingUrl,
            durationSec: event.durationSec,
          },
        });
        break;
      case 'amd.result':
        // Answering-machine detection. A machine/fax → treat as voicemail:
        // set the call's endReason + disposition, and flip the bulk entry to
        // 'voicemail' so the campaign engine's retry policy can act on it.
        if (event.result === 'machine' || event.result === 'fax') {
          await callSessionRepository.updateStatus(sessionId, {
            endReason: 'voicemail',
            disposition: { outcome: 'voicemail' },
          });
          try {
            const bulkBatchId = (session.customMetadata as Record<string, unknown> | undefined)?.bulkBatchId;
            if (typeof bulkBatchId === 'string') {
              await VoiceBulkBatch.updateOne(
                {
                  _id: bulkBatchId,
                  entries: { $elemMatch: { callSessionId: session._id, status: { $in: ['in_progress', 'placing'] } } },
                },
                {
                  $set: { 'entries.$.status': 'voicemail' },
                  $inc: { 'totals.inProgress': -1, 'totals.voicemail': 1 },
                },
              );
            }
          } catch (err) {
            console.error('[voice-webhook] amd voicemail bulk update failed:', err);
          }
        }
        break;
      case 'dtmf.received':
        // Caller pressed keypad digits. Resume any gather-dtmf paused
        // executions matching this contact, then fall through to broadcast.
        try {
          const contactKey = session.fromContactId?.toString()
            ?? session.toContactId?.toString();
          if (contactKey) {
            await resumePausedExecutionsForEvent({
              kind: 'voice.dtmf_received',
              key: contactKey,
              payload: { digits: event.digits, callSessionId: sessionId },
            });
          }
        } catch (err) {
          console.error('[voice-webhook] dtmf resume failed:', err);
        }
        break;
      case 'transcript.available':
        // Phase 5 will hook STT/AI here. For now we just broadcast.
        break;
    }

    broadcastVoiceEvent(sessionId, event);
  }

  // Twilio answer URLs expect a TwiML response if this is the answer hook.
  // Default is JSON; the answer/inbound TwiML helper will be added in Phase 5
  // once AI bot routing lands.
  return NextResponse.json({ ok: true, eventsProcessed: events.length });
}
