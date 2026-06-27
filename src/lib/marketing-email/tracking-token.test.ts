import { describe, it, expect, beforeAll } from 'vitest';
import {
  encodeTrackingToken,
  decodeTrackingToken,
  type TrackingTokenPayload,
} from './tracking-token';

const PAYLOAD: TrackingTokenPayload = {
  orgId: 'org_1',
  campaignId: 'camp_1',
  contactId: 'contact_1',
  email: 'a@example.com',
  providerId: 'brevo',
};

beforeAll(() => {
  process.env.EMAIL_TRACKING_SECRET = 'test-secret-for-tracking-tokens';
});

describe('tracking-token round-trip', () => {
  it('encodes then decodes back to the original payload', () => {
    const token = encodeTrackingToken(PAYLOAD);
    expect(decodeTrackingToken(token)).toEqual(PAYLOAD);
  });

  it('preserves an optional url (click token)', () => {
    const withUrl = { ...PAYLOAD, url: 'https://example.com/landing?a=1' };
    const token = encodeTrackingToken(withUrl);
    expect(decodeTrackingToken(token)).toEqual(withUrl);
  });

  it('produces a `body.signature` wire format', () => {
    const token = encodeTrackingToken(PAYLOAD);
    expect(token.split('.')).toHaveLength(2);
  });
});

describe('tracking-token tamper / malformed rejection', () => {
  it('rejects a token with no signature separator', () => {
    expect(decodeTrackingToken('justbody')).toBeNull();
  });

  it('rejects when the body is tampered (signature mismatch)', () => {
    const token = encodeTrackingToken(PAYLOAD);
    const [, sig] = token.split('.');
    const forgedBody = Buffer.from(
      JSON.stringify({ ...PAYLOAD, orgId: 'attacker' }),
      'utf-8'
    ).toString('base64url');
    expect(decodeTrackingToken(`${forgedBody}.${sig}`)).toBeNull();
  });

  it('rejects when the signature is altered', () => {
    const token = encodeTrackingToken(PAYLOAD);
    const [body] = token.split('.');
    expect(decodeTrackingToken(`${body}.deadbeef`)).toBeNull();
  });

  it('rejects a signature of a different byte length (no timingSafeEqual throw)', () => {
    const token = encodeTrackingToken(PAYLOAD);
    const [body] = token.split('.');
    expect(decodeTrackingToken(`${body}.ab`)).toBeNull();
  });

  it('rejects an empty token', () => {
    expect(decodeTrackingToken('')).toBeNull();
    expect(decodeTrackingToken('.sig')).toBeNull();
  });

  it('rejects a validly-signed but field-incomplete payload', () => {
    // Correctly signed (encode does no validation) but missing required fields
    // (empty contactId/email are falsy) → post-verify field check returns null.
    const token = encodeTrackingToken({
      orgId: 'o',
      campaignId: 'c',
      contactId: '',
      email: '',
      providerId: 'p',
    });
    expect(decodeTrackingToken(token)).toBeNull();
  });
});
