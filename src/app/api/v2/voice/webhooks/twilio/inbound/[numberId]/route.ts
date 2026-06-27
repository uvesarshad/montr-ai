/**
 * Twilio inbound answer endpoint (V-6.2).
 *
 * Twilio hits this URL when a call lands on a phone number whose `voiceUrl`
 * points here. The handler:
 *   1. Verifies the Twilio signature against the system credential (we use
 *      the system creds for inbound since the number doesn't carry its own).
 *   2. Looks up the `VoicePhoneNumber` record by `numberId` to find the
 *      configured `inboundRouting`.
 *   3. Creates a new inbound `CallSession` (provider call ID = Twilio CallSid).
 *   4. Returns TwiML matching the routing type:
 *        - workflow   → fires `call_inbound` trigger, plays a holding message
 *        - ai_bot     → returns <Connect><Stream> pointing to our WS endpoint
 *        - human_queue → not yet implemented — falls back to greeting + pause
 *        - forward    → <Dial> the target number
 *        - voicemail  → <Record>
 *        - disabled   → <Hangup/>
 *
 * Response content type is `text/xml` — TwiML, not JSON.
 */

import { NextRequest } from 'next/server';

import {
  callSessionRepository,
  voicePhoneNumberRepository,
  voiceProviderConfigRepository,
} from '@/lib/db/repository/voice';
import { initVoiceSubsystem } from '@/lib/voice/bootstrap';
import { getVoiceProvider } from '@/lib/voice';
import type { VoiceProviderCredential } from '@/lib/voice/types';
import { dispatchTrigger } from '@/lib/workflow/triggers/dispatch';
import {
  twimlConnectMediaStream,
  twimlForward,
  twimlGreetingAndPause,
  twimlHangup,
  twimlVoicemail,
} from '@/lib/voice/providers/twilio-twiml';
import { resolveContact } from '@/lib/identity';
import { publishDomainEvent } from '@/lib/events/domain-bus';

initVoiceSubsystem();

interface Ctx {
  params: Promise<{ numberId: string }>;
}

function getBaseUrl(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.NEXTAUTH_URL
    ?? new URL(request.url).origin
  );
}

function getMediaStreamWssUrl(baseUrl: string, callSessionId: string): string {
  // Twilio Media Streams require wss:// URLs. Swap http/https → ws/wss.
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `/api/v2/voice/media-stream/${callSessionId}`;
  return url.toString();
}

function twimlReply(body: string) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/xml; charset=utf-8' },
  });
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const { numberId } = await ctx.params;

  // Find the owned phone number row by its Mongo _id.
  const numberDoc = await voicePhoneNumberRepository.findByIdUnsafe(numberId);

  if (!numberDoc) {
    // Twilio expects valid TwiML even for unknown numbers — hang up cleanly.
    return twimlReply(twimlHangup());
  }

  const provider = getVoiceProvider('twilio');
  if (!provider) {
    return twimlReply(twimlHangup());
  }

  // Verify signature using either the org-scoped or system credential.
  const orgConfigs = await voiceProviderConfigRepository.listByScope('org', {
});
  const enabledOrg = orgConfigs.find(c => c.providerId === 'twilio' && c.enabled);
  const sys = await voiceProviderConfigRepository.findSystemCredential();

  const credential: VoiceProviderCredential | null = enabledOrg
    ? {
        providerId: enabledOrg.providerId,
        name: enabledOrg.displayName,
        type: 'custom',
        encryptedValue: enabledOrg.encryptedValue,
        iv: enabledOrg.iv,
        authTag: enabledOrg.authTag,
        salt: enabledOrg.salt,
        metadata: {
          ...(enabledOrg.metadata ?? {}),
          userId: enabledOrg.ownerUserId.toString(),
        },
      }
    : sys;

  if (!credential) {
    return twimlReply(twimlHangup());
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
      signature: headers['x-twilio-signature'],
      url: request.url,
    },
    credential,
  );
  if (!verification.valid) {
    console.warn('[voice-inbound] signature failed:', verification.reason);
    return twimlReply(twimlHangup());
  }

  const params = Object.fromEntries(new URLSearchParams(rawBody));
  const callSid = params.CallSid;
  const fromNumber = params.From;
  const toNumber = params.To ?? numberDoc.phoneNumber;

  if (!callSid || !fromNumber) {
    return twimlReply(twimlHangup());
  }

  // Identity resolution via B3's X2 resolver. Brand-aware: scopes to the
  // owned phone number's brand so two brands with overlapping contacts don't
  // collide. `createIfMissing: false` keeps cold inbound calls from creating
  // ghost contacts — the bulk dialer / CRM ingestion paths handle creation.
  let fromContactId: string | undefined;
  let contactsResolvedByX2 = false;
  try {
    const resolved = await resolveContact({
      brandId: numberDoc.brandId?.toString() ?? null,
      phone: fromNumber,
      createIfMissing: false,
    });
    if (resolved.contact?._id) {
      fromContactId = resolved.contact._id.toString();
      contactsResolvedByX2 = true;
    }
  } catch (err) {
    console.warn('[voice-inbound] resolveContact failed:', err);
  }

  // Avoid creating duplicate sessions if Twilio retries this request.
  let session = await callSessionRepository.findByProviderCallId('twilio', callSid);
  if (!session) {
    session = await callSessionRepository.create({
      brandId: numberDoc.brandId?.toString() ?? null,
      providerId: 'twilio',
      providerCallId: callSid,
      providerConfigId: enabledOrg?._id?.toString(),
      direction: 'inbound',
      fromNumber,
      toNumber,
      fromContactId,
      contactsResolvedByX2,
      status: 'ringing',
      phoneNumberId: numberDoc._id?.toString(),
      customMetadata: { numberId: numberDoc._id?.toString() },
    });
  }

  const sessionId = session._id?.toString();
  if (!sessionId) {
    return twimlReply(twimlHangup());
  }

  // Build the TwiML response based on the configured inbound routing.
  const routing = numberDoc.inboundRouting ?? { type: 'disabled' };
  const baseUrl = getBaseUrl(request);

  switch (routing.type) {
    case 'disabled':
      return twimlReply(twimlHangup());

    case 'voicemail':
      return twimlReply(
        twimlVoicemail({
          greeting: 'Please leave your message after the beep.',
          maxLengthSec: routing.maxRingSeconds ?? 120,
          recordingStatusCallback: `${baseUrl}/api/v2/voice/webhooks/twilio/status/${encodeURIComponent(sessionId)}`,
        }),
      );

    case 'forward': {
      if (!routing.targetId) {
        return twimlReply(twimlHangup());
      }
      return twimlReply(
        twimlForward(routing.targetId, {
          callerId: numberDoc.phoneNumber,
          timeout: routing.maxRingSeconds ?? 30,
        }),
      );
    }

    case 'ai_bot': {
      // Persist the aiBotId on the session so the WS handler can hydrate the
      // engine with the bot's systemPrompt, character voice, and KB-aware
      // tool layer (B3-4.5.5).
      if (routing.targetId) {
        try {
          await callSessionRepository.updateMetadata(sessionId, {
            aiBotId: routing.targetId,
          });
        } catch (err) {
          console.warn('[voice-inbound] failed to persist aiBotId on session:', err);
        }
      }

      return twimlReply(
        twimlConnectMediaStream(getMediaStreamWssUrl(baseUrl, sessionId), {
          callSessionId: sessionId,
          aiBotId: routing.targetId ?? '',
        }),
      );
    }

    case 'workflow': {
      // Fire the call_inbound trigger so any workflow matching this number /
      // direction starts its execution. The call itself goes on hold while
      // the workflow runs — typical workflow either:
      //   - hangs up after recording a contact creation event
      //   - transfers to a human queue based on intent
      // The "Pause" gives the workflow up to 60s to update the call.
      try {
        await dispatchTrigger({
          kind: 'call_inbound',
          callSessionId: sessionId,
          providerCallId: callSid,
          direction: 'inbound',
          fromNumber,
          toNumber,
          fromContactId,
          phoneNumberId: numberDoc._id?.toString(),
          brandId: numberDoc.brandId?.toString(),
        });
      } catch (err) {
        console.error('[voice-inbound] call_inbound dispatch failed:', err);
      }
      void publishDomainEvent({
        type: 'voice.call_inbound',
        brandId: numberDoc.brandId?.toString(),
        source: 'voice-inbound',
        payload: {
          callSessionId: sessionId,
          providerCallId: callSid,
          fromNumber,
          toNumber,
          fromContactId,
          phoneNumberId: numberDoc._id?.toString(),
        },
      });
      return twimlReply(
        twimlGreetingAndPause(
          'Please hold while we connect you to the right person.',
        ),
      );
    }

    case 'human_queue':
    default:
      return twimlReply(
        twimlGreetingAndPause(
          'Please hold while we connect you to a member of our team.',
        ),
      );
  }
}
