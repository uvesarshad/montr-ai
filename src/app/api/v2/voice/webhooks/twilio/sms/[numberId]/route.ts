/**
 * Twilio inbound SMS endpoint (H16).
 *
 * Twilio POSTs here when an SMS lands on a provisioned number whose
 * Messaging webhook points at this route (per-number `[numberId]`). The handler
 * mirrors the inbound VOICE route's signature/credential flow:
 *   1. Look up the `VoicePhoneNumber` by `numberId` → org + brand scope.
 *   2. Verify the Twilio signature using the org-scoped (or system) credential,
 *      via the same `provider.verifyWebhookSignature` used for voice.
 *   3. Resolve the inbound `From` number to a CRM contact (brand-aware,
 *      `createIfMissing: false` — no ghost contacts from cold inbound).
 *   4. Resume any workflow paused on `wait_for_channel_response(channel: sms)`
 *      for that contact via `resumePausedExecutionsForChannelMessage`.
 *
 * Returns empty TwiML (`<Response/>`) so Twilio sends no auto-reply.
 */

import { NextRequest } from 'next/server';

import {
  voicePhoneNumberRepository,
  voiceProviderConfigRepository,
} from '@/lib/db/repository/voice';
import { initVoiceSubsystem } from '@/lib/voice/bootstrap';
import { getVoiceProvider } from '@/lib/voice';
import type { VoiceProviderCredential } from '@/lib/voice/types';
import { resolveContact } from '@/lib/identity';
import { resumePausedExecutionsForChannelMessage } from '@/lib/workflow/resume-channel';
import { publishDomainEvent } from '@/lib/events/domain-bus';

initVoiceSubsystem();

interface Ctx {
  params: Promise<{ numberId: string }>;
}

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>';

function twimlReply(body: string = EMPTY_TWIML) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/xml; charset=utf-8' },
  });
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const { numberId } = await ctx.params;

  const numberDoc = await voicePhoneNumberRepository.findByIdUnsafe(numberId);
  if (!numberDoc) {
    // Unknown number — acknowledge so Twilio doesn't retry, but do nothing.
    return twimlReply();
  }

  const provider = getVoiceProvider('twilio');
  if (!provider) {
    return twimlReply();
  }
  const brandId = numberDoc.brandId?.toString() ?? null;

  // Verify signature using the org-scoped credential, falling back to system —
  // identical credential selection to the inbound voice route.
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
    return twimlReply();
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
    console.warn('[sms-inbound] signature failed:', verification.reason);
    // 403 so Twilio surfaces the failure (matches a hard-reject for forged posts).
    return new Response('invalid signature', { status: 403 });
  }

  const params = Object.fromEntries(new URLSearchParams(rawBody));
  const messageSid = params.MessageSid ?? params.SmsSid;
  const fromNumber = params.From;
  const toNumber = params.To ?? numberDoc.phoneNumber;
  const text = params.Body ?? '';

  if (!messageSid || !fromNumber) {
    return twimlReply();
  }

  // Brand-aware identity resolution (same idiom as inbound voice). Cold inbound
  // SMS does NOT create ghost contacts.
  let fromContactId: string | undefined;
  try {
    const resolved = await resolveContact({
      brandId,
      phone: fromNumber,
      createIfMissing: false,
    });
    if (resolved.contact?._id) {
      fromContactId = resolved.contact._id.toString();
    }
  } catch (err) {
    console.warn('[sms-inbound] resolveContact failed:', err);
  }

  // Resume workflows parked on wait_for_channel_response(channel: sms) for this
  // contact — the SMS-fallback resume path.
  if (fromContactId) {
    try {
      await resumePausedExecutionsForChannelMessage({
        channel: 'sms',
        contactId: fromContactId,
        message: {
          messageId: messageSid,
          content: text.slice(0, 500),
          direction: 'inbound',
          extra: { fromNumber, toNumber, providerMessageId: messageSid },
        },
      });
    } catch (err) {
      console.error('[sms-inbound] resume failed:', err);
    }
  }

  // Surface the inbound message on the domain bus for downstream consumers
  // (notifications / inbox). Uses the generic `message.received` channel event.
  void publishDomainEvent({
    type: 'message.received',
    brandId: brandId ?? undefined,
    source: 'sms-inbound',
    payload: {
      channel: 'sms',
      providerMessageId: messageSid,
      fromNumber,
      toNumber,
      fromContactId,
      body: text,
      phoneNumberId: numberDoc._id?.toString(),
    },
  });

  return twimlReply();
}
