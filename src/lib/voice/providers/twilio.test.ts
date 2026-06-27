/**
 * Twilio provider tests — signature verification + webhook normalization.
 *
 * Network calls (REST API) are NOT tested here; that needs the live SDK and
 * happens in V-9.3 manual smoke test.
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

import { twilioProvider } from './twilio';
import { encryptCredential } from '@/lib/workflow/credential-encryption';
import type { VoiceProviderCredential } from '@/lib/voice/types';

/**
 * Build a Twilio credential whose decrypt path returns {accountSid, authToken}.
 * Sets the env var the encryption service requires for derivation.
 */
function buildCredential(authToken: string, accountSid = 'AC' + 'a'.repeat(32)): VoiceProviderCredential {
  process.env.WORKFLOW_ENCRYPTION_KEY = process.env.WORKFLOW_ENCRYPTION_KEY
    ?? crypto.randomBytes(32).toString('hex');

  const encrypted = encryptCredential(
    'twilio-test',
    'custom',
    { accountSid, authToken },
    'test-user',
    { userId: 'test-user' },
  );

  return {
    providerId: 'twilio',
    name: encrypted.name,
    type: encrypted.type,
    encryptedValue: encrypted.encryptedValue,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    salt: encrypted.salt,
    metadata: { userId: 'test-user' },
  };
}

function twilioSign(authToken: string, url: string, params: Record<string, string>): string {
  const sorted = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('');
  const data = url + sorted;
  return crypto.createHmac('sha1', authToken).update(data).digest('base64');
}

describe('twilioProvider.verifyWebhookSignature', () => {
  const url = 'https://example.test/api/v2/voice/webhooks/twilio/status/call-1';
  const authToken = 'test-auth-token';

  it('rejects missing signature', () => {
    const credential = buildCredential(authToken);
    const result = twilioProvider.verifyWebhookSignature(
      {
        rawBody: 'CallSid=CA123&CallStatus=completed',
        headers: {},
        url,
      },
      credential,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('missing');
  });

  it('accepts a correctly signed payload', () => {
    const credential = buildCredential(authToken);
    const params = { CallSid: 'CA123', CallStatus: 'completed' };
    const signature = twilioSign(authToken, url, params);

    const result = twilioProvider.verifyWebhookSignature(
      {
        rawBody: new URLSearchParams(params).toString(),
        headers: { 'x-twilio-signature': signature },
        url,
      },
      credential,
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a tampered payload', () => {
    const credential = buildCredential(authToken);
    const params = { CallSid: 'CA123', CallStatus: 'completed' };
    const signature = twilioSign(authToken, url, params);

    // Tamper with the body — same signature should now be invalid.
    const tamperedParams = { CallSid: 'CA123', CallStatus: 'busy' };

    const result = twilioProvider.verifyWebhookSignature(
      {
        rawBody: new URLSearchParams(tamperedParams).toString(),
        headers: { 'x-twilio-signature': signature },
        url,
      },
      credential,
    );
    expect(result.valid).toBe(false);
  });
});

describe('twilioProvider.handleInboundWebhook', () => {
  it('normalizes call status events', async () => {
    const events = await twilioProvider.handleInboundWebhook({
      rawBody: new URLSearchParams({
        CallSid: 'CA1',
        CallStatus: 'completed',
        CallDuration: '42',
      }).toString(),
      headers: {},
      url: 'https://example.test',
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'call.completed',
      providerCallId: 'CA1',
      durationSec: 42,
    });
  });

  it('emits failed events for failed/busy/no-answer status', async () => {
    for (const status of ['failed', 'busy', 'no-answer', 'canceled']) {
      const events = await twilioProvider.handleInboundWebhook({
        rawBody: new URLSearchParams({ CallSid: 'CA2', CallStatus: status }).toString(),
        headers: {},
        url: 'https://example.test',
      });
      expect(events[0]?.type).toBe('call.failed');
    }
  });

  it('emits dtmf.received when Digits is present', async () => {
    const events = await twilioProvider.handleInboundWebhook({
      rawBody: new URLSearchParams({ CallSid: 'CA3', Digits: '1234' }).toString(),
      headers: {},
      url: 'https://example.test',
    });

    const dtmf = events.find(e => e.type === 'dtmf.received');
    expect(dtmf).toBeDefined();
    if (dtmf?.type === 'dtmf.received') {
      expect(dtmf.digits).toBe('1234');
    }
  });

  it('returns empty array when CallSid is missing', async () => {
    const events = await twilioProvider.handleInboundWebhook({
      rawBody: 'foo=bar',
      headers: {},
      url: 'https://example.test',
    });
    expect(events).toEqual([]);
  });
});
