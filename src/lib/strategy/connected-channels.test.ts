import { describe, it, expect } from 'vitest';

import { normalizeChannel } from './connected-channels';

describe('connected-channels · normalizeChannel', () => {
  it('maps common aliases to canonical ids', () => {
    expect(normalizeChannel('Twitter')).toBe('x');
    expect(normalizeChannel('tweet')).toBe('x');
    expect(normalizeChannel('IG')).toBe('instagram');
    expect(normalizeChannel('insta')).toBe('instagram');
    expect(normalizeChannel('fb')).toBe('facebook');
    expect(normalizeChannel('gbp')).toBe('google_business');
    expect(normalizeChannel('google business')).toBe('google_business');
    expect(normalizeChannel('wa')).toBe('whatsapp');
    expect(normalizeChannel('yt')).toBe('youtube');
    expect(normalizeChannel('li')).toBe('linkedin');
  });

  it('maps voice/email synonyms', () => {
    expect(normalizeChannel('call')).toBe('voice');
    expect(normalizeChannel('phone')).toBe('voice');
    expect(normalizeChannel('newsletter')).toBe('email');
    expect(normalizeChannel('mail')).toBe('email');
  });

  it('is identity for canonical literals (case/space-insensitive)', () => {
    expect(normalizeChannel('instagram')).toBe('instagram');
    expect(normalizeChannel('  WhatsApp ')).toBe('whatsapp');
    expect(normalizeChannel('google_business')).toBe('google_business');
  });

  it('returns null for unknown channels', () => {
    expect(normalizeChannel('carrier-pigeon')).toBeNull();
    expect(normalizeChannel('')).toBeNull();
  });
});
