import { NextRequest, NextResponse } from 'next/server';
import { getClientIP, isIndianUser } from '@/lib/geo-pricing';

/**
 * GET /api/v2/geo
 * Returns the user's detected country and preferred currency.
 * Used by the pricing page to show the right price.
 */
export async function GET(request: NextRequest) {
    try {
        const clientIP = getClientIP(request);
        const india = await isIndianUser(clientIP);

        return NextResponse.json({
            currency: india ? 'INR' : 'USD',
            isIndia: india,
            ip: clientIP, // for debugging (remove in production if desired)
        });
    } catch {
        return NextResponse.json({ currency: 'USD', isIndia: false });
    }
}
