import { describe, it, expect, afterEach } from 'vitest';
import { getClientIP, getPlanPricing } from './geo-pricing';

function reqWith(headers: Record<string, string>): Request {
  return { headers: new Headers(headers) } as unknown as Request;
}

describe('getClientIP', () => {
  it('prefers cf-connecting-ip over other headers', () => {
    const ip = getClientIP(
      reqWith({ 'cf-connecting-ip': '1.2.3.4', 'x-real-ip': '9.9.9.9' })
    );
    expect(ip).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip when cf header absent', () => {
    expect(getClientIP(reqWith({ 'x-real-ip': '8.8.8.8' }))).toBe('8.8.8.8');
  });

  it('takes the first hop of a comma-separated x-forwarded-for', () => {
    expect(
      getClientIP(reqWith({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1, 10.0.0.2' }))
    ).toBe('203.0.113.5');
  });

  it('skips loopback values and continues to the next candidate', () => {
    expect(
      getClientIP(reqWith({ 'cf-connecting-ip': '127.0.0.1', 'x-real-ip': '5.6.7.8' }))
    ).toBe('5.6.7.8');
  });

  it('returns null when no usable header is present', () => {
    expect(getClientIP(reqWith({}))).toBeNull();
  });

  it('returns null when only loopback addresses are present', () => {
    expect(getClientIP(reqWith({ 'x-real-ip': '::1' }))).toBeNull();
  });
});

describe('getPlanPricing', () => {
  const ENV_KEYS = [
    'NEXT_PUBLIC_APP_CURRENCY',
    'NEXT_PUBLIC_RAZORPAY_CURRENCY',
    'NEXT_PUBLIC_EXCHANGE_RATE',
  ];
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('converts USD→INR for Indian users when target currency is INR', () => {
    process.env.NEXT_PUBLIC_APP_CURRENCY = 'USD';
    process.env.NEXT_PUBLIC_RAZORPAY_CURRENCY = 'INR';
    process.env.NEXT_PUBLIC_EXCHANGE_RATE = '80';
    expect(getPlanPricing({ price: 10 }, true)).toEqual({ price: 800, currency: 'INR' });
  });

  it('rounds the converted price', () => {
    process.env.NEXT_PUBLIC_APP_CURRENCY = 'USD';
    process.env.NEXT_PUBLIC_RAZORPAY_CURRENCY = 'INR';
    process.env.NEXT_PUBLIC_EXCHANGE_RATE = '83';
    expect(getPlanPricing({ price: 9.99 }, true).price).toBe(Math.round(9.99 * 83));
  });

  it('keeps base price/currency for non-Indian users', () => {
    process.env.NEXT_PUBLIC_APP_CURRENCY = 'USD';
    process.env.NEXT_PUBLIC_RAZORPAY_CURRENCY = 'INR';
    expect(getPlanPricing({ price: 25 }, false)).toEqual({ price: 25, currency: 'USD' });
  });

  it('does not convert when base currency is not USD even for Indian users', () => {
    process.env.NEXT_PUBLIC_APP_CURRENCY = 'INR';
    process.env.NEXT_PUBLIC_RAZORPAY_CURRENCY = 'INR';
    expect(getPlanPricing({ price: 500 }, true)).toEqual({ price: 500, currency: 'INR' });
  });

  it('defaults to USD with an 83 exchange rate when env is unset', () => {
    for (const k of ENV_KEYS) delete process.env[k];
    // base=USD, target=USD (defaults to base) → no conversion branch taken
    expect(getPlanPricing({ price: 12 }, true)).toEqual({ price: 12, currency: 'USD' });
  });
});
