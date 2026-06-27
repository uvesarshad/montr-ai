/**
 * Geo-detection utility for pricing
 *
 * Detects whether the user is from India based on their IP address.
 * Used to show INR pricing for Indian users and USD for international users.
 */

/**
 * Get the real client IP from a Next.js request, handling proxies/CDNs.
 */
export function getClientIP(request: Request): string | null {
    const headers = request.headers as { get?: (name: string) => string | null };

    // Standard proxy headers (in order of preference)
    const candidates = [
        headers.get?.('cf-connecting-ip'),       // Cloudflare
        headers.get?.('x-real-ip'),              // Nginx proxy
        headers.get?.('x-forwarded-for'),        // Standard proxy header (may be comma-separated)
        headers.get?.('x-client-ip'),
        headers.get?.('fastly-client-ip'),       // Fastly CDN
        headers.get?.('true-client-ip'),         // Akamai / Cloudflare Enterprise
    ];

    for (const candidate of candidates) {
        if (candidate) {
            // x-forwarded-for can be "client, proxy1, proxy2" — take the first
            const ip = candidate.split(',')[0].trim();
            if (ip && ip !== '::1' && ip !== '127.0.0.1') {
                return ip;
            }
        }
    }

    return null;
}

/**
 * Detect whether the user is from India using ip-api.com (free, no key needed).
 * Falls back to false (international) on any error.
 */
export async function isIndianUser(ip: string | null): Promise<boolean> {
    if (!ip) return false;

    // Skip geo-check for private/loopback IPs (local dev)
    if (
        ip === '127.0.0.1' ||
        ip === '::1' ||
        ip.startsWith('192.168.') ||
        ip.startsWith('10.') ||
        ip.startsWith('172.')
    ) {
        // In local dev, default to India (since this is an Indian product)
        return true;
    }

    try {
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`, {
            signal: AbortSignal.timeout(2000), // 2s timeout
        });

        if (!res.ok) return false;

        const data = await res.json();
        return data.countryCode === 'IN';
    } catch {
        // On any error, default to international (USD)
        return false;
    }
}

/**
 * Get the currency and price for a plan based on the user's location.
 */
export function getPlanPricing(
    plan: { price: number },
    isIndia: boolean
): { price: number; currency: 'INR' | 'USD' } {
    const baseCurrency = process.env.NEXT_PUBLIC_APP_CURRENCY || 'USD';
    const targetCurrency = process.env.NEXT_PUBLIC_RAZORPAY_CURRENCY || baseCurrency;
    const exchangeRate = parseFloat(process.env.NEXT_PUBLIC_EXCHANGE_RATE || '83');

    if (isIndia) {
        // If user is Indian, and base is USD but Razorpay target is INR:
        if (baseCurrency === 'USD' && targetCurrency === 'INR') {
            return { price: Math.round(plan.price * exchangeRate), currency: 'INR' };
        }
        return { price: plan.price, currency: baseCurrency as 'INR' | 'USD' };
    } else {
        return { price: plan.price, currency: baseCurrency as 'INR' | 'USD' };
    }
}
