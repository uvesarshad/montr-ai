import { describe, it, expect } from 'vitest';
import { generateAvatarIndex, getDefaultAvatar, getUserAvatar } from './avatar-utils';

describe('generateAvatarIndex', () => {
  it('returns 0 for empty / falsy input', () => {
    expect(generateAvatarIndex('')).toBe(0);
    // @ts-expect-error exercising runtime guard with nullish input
    expect(generateAvatarIndex(undefined)).toBe(0);
  });

  it('is deterministic for the same id', () => {
    const a = generateAvatarIndex('user-abc-123');
    const b = generateAvatarIndex('user-abc-123');
    expect(a).toBe(b);
  });

  it('always returns an integer in the 0..24 range', () => {
    const ids = ['a', 'longer-id', '😀emoji', '0', 'ZZZZZZZZZZ', 'user_999', '__'];
    for (const id of ids) {
      const idx = generateAvatarIndex(id);
      expect(Number.isInteger(idx)).toBe(true);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(24);
    }
  });

  it('produces different indices for at least some distinct ids', () => {
    const set = new Set(
      ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'].map(generateAvatarIndex),
    );
    expect(set.size).toBeGreaterThan(1);
  });
});

describe('getDefaultAvatar', () => {
  it('maps an id to a 1-based avatar png path', () => {
    const idx = generateAvatarIndex('user-abc-123');
    expect(getDefaultAvatar('user-abc-123')).toBe(`/avatars/avatar-${idx + 1}.png`);
  });

  it('keeps the file number in the 1..25 range', () => {
    for (const id of ['', 'x', 'a-very-long-identifier-string', '12345']) {
      const url = getDefaultAvatar(id);
      const match = url.match(/^\/avatars\/avatar-(\d+)\.png$/);
      expect(match).not.toBeNull();
      const num = Number(match![1]);
      expect(num).toBeGreaterThanOrEqual(1);
      expect(num).toBeLessThanOrEqual(25);
    }
  });
});

describe('getUserAvatar', () => {
  it('returns the custom image when provided', () => {
    expect(getUserAvatar('user-1', 'https://cdn.example.com/me.png')).toBe(
      'https://cdn.example.com/me.png',
    );
  });

  it('falls back to the default avatar when custom image is null / undefined / empty', () => {
    const fallback = getDefaultAvatar('user-1');
    expect(getUserAvatar('user-1', null)).toBe(fallback);
    expect(getUserAvatar('user-1', undefined)).toBe(fallback);
    expect(getUserAvatar('user-1', '')).toBe(fallback);
  });
});
