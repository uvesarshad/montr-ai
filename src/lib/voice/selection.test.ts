/**
 * Voice provider selection tests.
 *
 * Verifies the BYOK → brand → org → plan → system selection order, the
 * `preferredProviderId` filter, and graceful fallback when a candidate
 * credential references an unregistered provider.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { __resetVoiceProviderRegistryForTests, registerVoiceProvider } from './registry';
import {
  getProviderForCall,
  setVoiceProviderConfigLookup,
  type VoiceProviderConfigLookup,
} from './selection';
import type { VoiceProvider } from './provider';
import type {
  VoiceCallStatusSnapshot,
  VoiceEvent,
  VoiceInboundWebhookPayload,
  VoiceOutboundCallRequest,
  VoiceOutboundCallResult,
  VoicePlayAudioRequest,
  VoiceProviderCapabilities,
  VoiceProviderCredential,
  VoiceProviderId,
  VoiceSendDtmfRequest,
  VoiceWebhookVerification,
} from './types';

function makeMockProvider(id: VoiceProviderId): VoiceProvider {
  const noop = async () => undefined as unknown as void;
  return {
    id,
    capabilities: {
      supportsRecording: true,
      supportsTranscription: true,
      supportsSIP: false,
      supportsMediaStreams: true,
      supportsInboundProvisioning: true,
      pricePerMinuteUsd: 0.01,
    } satisfies VoiceProviderCapabilities,
    initiateOutboundCall: async (
      _r: VoiceOutboundCallRequest,
    ): Promise<VoiceOutboundCallResult> => ({
      providerCallId: 'mock-call-id',
      status: 'queued',
      startedAt: new Date(),
    }),
    hangup: noop as unknown as VoiceProvider['hangup'],
    sendDTMF: (async (_r: VoiceSendDtmfRequest) => {}) as VoiceProvider['sendDTMF'],
    playAudio: (async (_r: VoicePlayAudioRequest) => {}) as VoiceProvider['playAudio'],
    startRecording: async () => ({ recordingSid: 'rec-1' }),
    stopRecording: noop as unknown as VoiceProvider['stopRecording'],
    getCallStatus: async (): Promise<VoiceCallStatusSnapshot> => ({
      providerCallId: 'mock-call-id',
      status: 'completed',
    }),
    verifyWebhookSignature: (_p: VoiceInboundWebhookPayload): VoiceWebhookVerification => ({
      valid: true,
    }),
    handleInboundWebhook: async (): Promise<VoiceEvent[]> => [],
  };
}

function makeCredential(providerId: VoiceProviderId, marker: string): VoiceProviderCredential {
  return {
    providerId,
    name: marker,
    type: 'custom',
    encryptedValue: '',
    iv: '',
    authTag: '',
    salt: '',
    metadata: { marker },
  };
}

interface MockLookupConfig {
  byok?: VoiceProviderCredential | null;
  brand?: VoiceProviderCredential | null;
  org?: VoiceProviderCredential | null;
  plan?: VoiceProviderCredential | null;
  system?: VoiceProviderCredential | null;
}

function makeLookup(config: MockLookupConfig): VoiceProviderConfigLookup {
  return {
    findByokCredential: async () => config.byok ?? null,
    findBrandCredential: async () => config.brand ?? null,
    findOrgCredential: async () => config.org ?? null,
    findPlanCredential: async () => config.plan ?? null,
    findSystemCredential: async () => config.system ?? null,
  };
}

describe('getProviderForCall', () => {
  beforeEach(() => {
    __resetVoiceProviderRegistryForTests();
    registerVoiceProvider(makeMockProvider('twilio'));
    registerVoiceProvider(makeMockProvider('plivo'));
  });

  afterEach(() => {
    setVoiceProviderConfigLookup(null);
    __resetVoiceProviderRegistryForTests();
  });

  it('returns BYOK when user has a credential', async () => {
    setVoiceProviderConfigLookup(
      makeLookup({
        byok: makeCredential('twilio', 'byok-twilio'),
        system: makeCredential('twilio', 'system-twilio'),
      }),
    );
    const result = await getProviderForCall({
      userId: 'u1',
      organizationId: 'o1',
    });
    expect(result).not.toBeNull();
    expect(result?.source).toBe('byok');
    expect(result?.credential.name).toBe('byok-twilio');
  });

  it('falls back to brand override when no BYOK', async () => {
    setVoiceProviderConfigLookup(
      makeLookup({
        brand: makeCredential('plivo', 'brand-plivo'),
        system: makeCredential('twilio', 'system-twilio'),
      }),
    );
    const result = await getProviderForCall({
      userId: 'u1',
      organizationId: 'o1',
      brandId: 'b1',
    });
    expect(result?.source).toBe('brand');
    expect(result?.provider.id).toBe('plivo');
  });

  it('falls back to org → plan → system in order', async () => {
    setVoiceProviderConfigLookup(
      makeLookup({
        plan: makeCredential('twilio', 'plan-twilio'),
        system: makeCredential('twilio', 'system-twilio'),
      }),
    );
    const result = await getProviderForCall({
      userId: 'u1',
      organizationId: 'o1',
    });
    expect(result?.source).toBe('plan');

    setVoiceProviderConfigLookup(
      makeLookup({
        system: makeCredential('twilio', 'system-twilio'),
      }),
    );
    const sys = await getProviderForCall({ userId: 'u1', organizationId: 'o1' });
    expect(sys?.source).toBe('system');
  });

  it('returns null when no credentials anywhere', async () => {
    setVoiceProviderConfigLookup(makeLookup({}));
    const result = await getProviderForCall({ userId: 'u1', organizationId: 'o1' });
    expect(result).toBeNull();
  });

  it('skips candidates whose provider impl is not registered', async () => {
    setVoiceProviderConfigLookup(
      makeLookup({
        byok: makeCredential('telnyx', 'byok-telnyx'), // not registered
        system: makeCredential('twilio', 'system-twilio'),
      }),
    );
    const result = await getProviderForCall({ userId: 'u1', organizationId: 'o1' });
    // BYOK's telnyx impl is not registered, fallback proceeds and lands on system.
    expect(result?.source).toBe('system');
    expect(result?.provider.id).toBe('twilio');
  });

  it('honors preferredProviderId — skips credentials that don\'t match', async () => {
    setVoiceProviderConfigLookup(
      makeLookup({
        byok: makeCredential('plivo', 'byok-plivo'),
        system: makeCredential('twilio', 'system-twilio'),
      }),
    );
    const result = await getProviderForCall({
      userId: 'u1',
      organizationId: 'o1',
      preferredProviderId: 'twilio',
    });
    expect(result?.source).toBe('system');
    expect(result?.provider.id).toBe('twilio');
  });

  it('throws if lookup is not initialized', async () => {
    setVoiceProviderConfigLookup(null);
    await expect(
      getProviderForCall({ userId: 'u1', organizationId: 'o1' }),
    ).rejects.toThrow(/config lookup not initialized/);
  });
});
