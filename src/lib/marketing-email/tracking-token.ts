import crypto from 'crypto';

/**
 * Signed open/click tracking tokens for marketing email.
 *
 * The token embeds the org/campaign/contact context (and, for click tracking,
 * the destination URL) and is HMAC-signed so the public tracking endpoint can
 * trust the `organizationId` without a DB lookup and can refuse to redirect to
 * any URL that wasn't issued by us. Without the signature an attacker could mint
 * tokens for any org (analytics/suppression poisoning) and turn the click
 * endpoint into an open redirect.
 *
 * Wire format: `base64url(JSON payload) + '.' + hmacSha256Hex(base64url body)`.
 */

export interface TrackingTokenPayload {
    orgId: string;
    campaignId: string;
    contactId: string;
    email: string;
    providerId: string;
    /** Only present for click tokens. */
    url?: string;
}

function getSecret(): string {
    const secret = process.env.EMAIL_TRACKING_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret) {
        throw new Error('EMAIL_TRACKING_SECRET or NEXTAUTH_SECRET must be set to sign tracking tokens');
    }
    return secret;
}

function sign(body: string): string {
    return crypto.createHmac('sha256', getSecret()).update(body).digest('hex');
}

export function encodeTrackingToken(payload: TrackingTokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
    return `${body}.${sign(body)}`;
}

/**
 * Verify and decode a tracking token. Returns null if the token is malformed or
 * the signature does not match (caller should treat null as a 400/403).
 */
export function decodeTrackingToken(token: string): TrackingTokenPayload | null {
    const dot = token.lastIndexOf('.');
    if (dot <= 0) return null;

    const body = token.slice(0, dot);
    const sig = token.slice(dot + 1);

    let expected: string;
    try {
        expected = sign(body);
    } catch {
        return null;
    }

    const sigBuf = Buffer.from(sig, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return null;
    }

    try {
        const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as TrackingTokenPayload;
        if (!parsed.orgId || !parsed.campaignId || !parsed.contactId || !parsed.email) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}
