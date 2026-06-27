/**
 * SMS send service (H16).
 *
 * SMS rides on the SAME Twilio (voice) credential + provisioned numbers as
 * outbound calls. This helper mirrors `make-call.ts`'s resolution chain exactly:
 *
 *   1. Provider/credential selection: BYOK → brand → org → plan → system
 *      (`getProviderForCall`).
 *   2. Plan gating (`checkVoiceGate`) — SMS counts against the voice gate;
 *      BYOK bypasses caps, just like calls (Q1.3).
 *   3. Sender number: explicit `from` override, otherwise the first active
 *      brand-scoped number owned by the org for the selected provider.
 *
 * Callers (the `send_sms` node processor, future inbox compose) get a
 * provider-agnostic result. Org is ALWAYS supplied by the caller from the
 * execution/session — never trusted from client input.
 */

import { getProviderForCall } from './selection';
import { checkVoiceGate } from './plan-gate';
import { voicePhoneNumberRepository } from '../db/repository/voice';
import type { VoiceSmsResult } from './types';

export interface SendSmsInput {
  userId: string;
  /** Brand-aware credential + number selection (agency mode). */
  brandId?: string | null;
  /** E.164 destination. */
  to: string;
  /** Message text. */
  body: string;
  /** Explicit sender number (E.164). Falls back to a provisioned number. */
  from?: string;
  /** Base URL for the provider delivery-status callback. */
  webhookBaseUrl?: string;
}

export interface SendSmsResolution extends VoiceSmsResult {
  providerId: string;
  /** Where the credential came from — useful for audit/debugging. */
  source: 'byok' | 'brand' | 'org' | 'plan' | 'system';
}

/**
 * Resolve provider/credential/number and send an SMS. Throws with a clear,
 * surfaceable message when no provider, plan gate, or sender number is
 * available — mirrors the failure paths in `make-call.ts`.
 */
export async function sendSmsViaProvider(
  input: SendSmsInput,
): Promise<SendSmsResolution> {
  const brandId = input.brandId ?? null;

  const selection = await getProviderForCall({
    userId: input.userId,
    brandId,
  });
  if (!selection) {
    throw new Error(
      'No SMS provider available — configure one in admin settings or BYOK',
    );
  }

  if (typeof selection.provider.sendSms !== 'function'
    || !selection.provider.capabilities.supportsSms) {
    throw new Error(
      `Provider "${selection.provider.id}" does not support SMS`,
    );
  }

  // Plan-tier gate. SMS shares the voice gate; BYOK bypasses caps (Q1.3).
  const gate = await checkVoiceGate({
    userId: input.userId,
    isByok: selection.source === 'byok',
    providerId: selection.provider.id,
  });
  if (!gate.allowed) {
    throw new Error(gate.reason ?? 'SMS not allowed on current plan');
  }

  let fromNumber = typeof input.from === 'string' && input.from.length > 0
    ? input.from
    : undefined;
  if (!fromNumber) {
    const owned = await voicePhoneNumberRepository.list({
      brandId,
      providerId: selection.provider.id,
      status: 'active',
    });
    if (owned.length === 0) {
      throw new Error(
        'No sender number available — provision a phone number first or set `from`',
      );
    }
    fromNumber = owned[0].phoneNumber;
  }

  const result = await selection.provider.sendSms(
    {
      from: fromNumber,
      to: input.to,
      body: input.body,
      statusCallbackUrl: input.webhookBaseUrl
        ? new URL(
            '/api/v2/voice/webhooks/twilio/sms-status',
            input.webhookBaseUrl,
          ).toString()
        : undefined,
    },
    selection.credential,
  );

  return {
    ...result,
    providerId: selection.provider.id,
    source: selection.source,
  };
}
