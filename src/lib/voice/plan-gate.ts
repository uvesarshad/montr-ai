// OSS carve stub (always-allow) of src/lib/voice/plan-gate.ts — single-tenant, unmetered.
/**
 * Voice plan-tier gating — OSS single-tenant stub.
 *
 * In the open-source build there are no plan tiers, no per-org minute caps,
 * and no DB-backed plan/credit lookups. Voice is always allowed and unmetered.
 * Every exported symbol below keeps the exact signature/shape of the private
 * source so the 6 call-sites do not move — only the bodies become no-ops.
 */

import type { VoiceProviderId } from './types';

export interface VoicePlanGateResult {
  allowed: boolean;
  reason?: string;
  /** Minutes used this calendar month (inbound + outbound). */
  minutesUsed: number;
  /** Plan cap (-1 = unlimited). */
  minutesLimit: number;
  allowVoice: boolean;
  allowVoiceByok: boolean;
  allowedVoiceProviders: VoiceProviderId[];
}

export interface VoiceGateInput {
  userId: string;
  /** Set to true when the chosen credential is BYOK — bypasses minute caps. */
  isByok?: boolean;
  /** Provider being used — checked against `allowedVoiceProviders`. */
  providerId?: VoiceProviderId;
}

/**
 * Check whether the user is allowed to place/receive a voice call right now.
 *
 * OSS stub: always allowed, unmetered (no plan, no caps, no DB query).
 */
export async function checkVoiceGate(
  _input: VoiceGateInput,
): Promise<VoicePlanGateResult> {
  return {
    allowed: true,
    minutesUsed: 0,
    minutesLimit: -1,
    allowVoice: true,
    allowVoiceByok: true,
    allowedVoiceProviders: [],
  };
}
