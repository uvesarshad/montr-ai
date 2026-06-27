import { describe, it, expect } from 'vitest';
import { normalizePhoneForMatch, toE164Display, normalizeEmail, normalizeHandle } from './normalize';

describe('normalizePhoneForMatch', () => {
  it('strips formatting and returns digits only', () => {
    expect(normalizePhoneForMatch('+91 98765 43210')).toBe('919876543210');
    expect(normalizePhoneForMatch('(415) 555-1234')).toBe('4155551234');
    expect(normalizePhoneForMatch('+1-415-555-1234')).toBe('14155551234');
  });

  it('returns null for too-short input', () => {
    expect(normalizePhoneForMatch('123')).toBeNull();
    expect(normalizePhoneForMatch('')).toBeNull();
    expect(normalizePhoneForMatch(null)).toBeNull();
    expect(normalizePhoneForMatch(undefined)).toBeNull();
  });

  it('returns null for non-numeric garbage', () => {
    expect(normalizePhoneForMatch('abc')).toBeNull();
  });

  it('normalizes the same number expressed differently to the same value', () => {
    const a = normalizePhoneForMatch('+91 98765 43210');
    const b = normalizePhoneForMatch('919876543210');
    const c = normalizePhoneForMatch('91-9876-543210');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

describe('toE164Display', () => {
  it('prepends + and strips formatting', () => {
    expect(toE164Display('+91 98765 43210')).toBe('+919876543210');
    expect(toE164Display('919876543210')).toBe('+919876543210');
  });

  it('returns null on too-short input', () => {
    expect(toE164Display('123')).toBeNull();
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Alice@Example.COM ')).toBe('alice@example.com');
  });

  it('rejects strings without an @', () => {
    expect(normalizeEmail('alice')).toBeNull();
  });

  it('handles nullish input', () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail('')).toBeNull();
  });
});

describe('normalizeHandle', () => {
  it('strips a single leading @ and lowercases case-insensitive platforms', () => {
    expect(normalizeHandle('instagram', '@AliceCo')).toBe('aliceco');
    expect(normalizeHandle('twitter', '@AliceCo')).toBe('aliceco');
    expect(normalizeHandle('facebook', '@AliceCo')).toBe('aliceco');
    expect(normalizeHandle('telegram', '@AliceCo')).toBe('aliceco');
  });

  it('preserves LinkedIn case', () => {
    expect(normalizeHandle('linkedin', 'in/AliceCo')).toBe('in/AliceCo');
  });

  it('routes WhatsApp through phone normalization', () => {
    expect(normalizeHandle('whatsapp', '+91 98765 43210')).toBe('919876543210');
    expect(normalizeHandle('whatsapp', '123')).toBeNull();
  });

  it('handles empty / nullish input', () => {
    expect(normalizeHandle('instagram', null)).toBeNull();
    expect(normalizeHandle('instagram', '')).toBeNull();
    expect(normalizeHandle('instagram', '@')).toBeNull();
  });
});
