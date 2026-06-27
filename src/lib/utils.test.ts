import { describe, it, expect } from 'vitest';
import { cn, formatCurrency } from './utils';

describe('cn', () => {
  it('joins multiple class names', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('drops falsy / conditional values', () => {
    expect(cn('a', false && 'b', null, undefined, '', 'c')).toBe('a c');
  });

  it('supports conditional object syntax (clsx)', () => {
    expect(cn('base', { active: true, hidden: false })).toBe('base active');
  });

  it('merges conflicting tailwind utilities, last one wins (twMerge)', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('returns an empty string for no / all-falsy input', () => {
    expect(cn()).toBe('');
    expect(cn(false, null, undefined)).toBe('');
  });
});

describe('formatCurrency', () => {
  it('formats USD by default', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });

  it('honours an explicit currency code', () => {
    // Non-breaking space separates the symbol in many locales; assert on parts.
    const out = formatCurrency(1000, 'EUR', 'en-US');
    expect(out).toContain('1,000.00');
    expect(out).toContain('€');
  });

  it('formats zero and negative amounts', () => {
    expect(formatCurrency(0)).toBe('$0.00');
    expect(formatCurrency(-50)).toBe('-$50.00');
  });
});
