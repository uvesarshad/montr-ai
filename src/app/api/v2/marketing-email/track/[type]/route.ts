
import { NextRequest, NextResponse } from 'next/server';
import { trackingService } from '@/lib/marketing-email/services/tracking.service';
import { decodeTrackingToken } from '@/lib/marketing-email/tracking-token';

export async function GET(request: NextRequest, props: { params: Promise<{ type: string }> }) {
    const params = await props.params;
    const type = params.type;
    const searchParams = request.nextUrl.searchParams;
    const data = searchParams.get('data');

    if (!data) {
        return new NextResponse('Invalid Request', { status: 400 });
    }

    try {
        // Verify the HMAC-signed token. A forged/unsigned token is rejected, so
        // the orgId can be trusted and the click URL cannot be tampered with.
        const payload = decodeTrackingToken(data);
        if (!payload) {
            return new NextResponse('Invalid Data', { status: 403 });
        }

        const { orgId, campaignId, contactId, email, providerId, url } = payload;

        const userAgent = request.headers.get('user-agent') || 'unknown';
        const ipAddress = request.headers.get('x-forwarded-for') || 'unknown';

        if (type === 'open') {
            await trackingService.recordEvent(
                orgId,
                `pixel-${campaignId}-${contactId}`, // Dummy message ID for pixel
                'opened',
                {
                    campaignId,
                    contactId,
                    email,
                    providerId,
                    userAgent,
                    ipAddress,
                }
            );

            // Return transparent 1x1 GIF
            const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
            return new NextResponse(gif, {
                headers: {
                    'Content-Type': 'image/gif',
                    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                },
            });

        } else if (type === 'click') {
            if (!url) {
                return new NextResponse('Missing URL', { status: 400 });
            }

            // The URL was signed into the token, but still enforce http(s) to
            // refuse javascript:/data: schemes.
            let target: URL;
            try {
                target = new URL(url);
            } catch {
                return new NextResponse('Invalid URL', { status: 400 });
            }
            if (target.protocol !== 'http:' && target.protocol !== 'https:') {
                return new NextResponse('Invalid URL', { status: 400 });
            }

            await trackingService.recordEvent(
                orgId,
                `click-${campaignId}-${contactId}-${Date.now()}`,
                'clicked',
                {
                    campaignId,
                    contactId,
                    email,
                    providerId,
                    url,
                    userAgent,
                    ipAddress,
                }
            );

            // Redirect to target URL
            return NextResponse.redirect(target.toString());
        }

        return new NextResponse('Unknown Type', { status: 404 });

    } catch (error) {
        console.error('Tracking Error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
