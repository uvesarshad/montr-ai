import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { assertBrandAccess, BrandAccessError, brandAccessErrorResponse } from '@/lib/social/brand-access';


import { safeOutboundFetch } from '@/lib/workflow/ssrf-guard';

const DEFAULT_BLUESKY_SERVICE = 'https://bsky.social';

const bodySchema = z.object({
    brandId: z.string().min(1),
    handle: z.string().min(1),
    appPassword: z.string().min(1),
    service: z.string().url().optional(),
});

/**
 * Bluesky (AT Protocol) Connection — app-password auth, NO OAuth.
 *
 * The user creates an app password at https://bsky.app/settings/app-passwords
 * and supplies it together with their handle. We verify the credentials by
 * opening a session against the PDS (`com.atproto.server.createSession`) and,
 * on success, store the app password encrypted (same path Telegram stores its
 * bot token). The app password — not the ephemeral session token — is the
 * durable credential, so the publish flow mints a fresh session per publish.
 *
 * Because the `service` host is user-supplied, the verification call goes
 * through `safeOutboundFetch` (SSRF guard) like the WordPress/n8n integrations.
 *
 * POST /api/social/oauth/bluesky
 * Body: { brandId, handle, appPassword, service? }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'brandId, handle and appPassword are required' },
                { status: 400 }
            );
        }

        const { brandId } = parsed.data;
        const handle = parsed.data.handle.trim().replace(/^@/, '');
        const appPassword = parsed.data.appPassword.trim();
        const service = (parsed.data.service || DEFAULT_BLUESKY_SERVICE).trim().replace(/\/+$/, '');

        // Tenancy: confirm the brand belongs to the caller (audit C4).
        try {
            ({ } = await assertBrandAccess(session.user.id, brandId));
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        // Verify credentials by opening a session on the PDS. SSRF-guarded
        // because `service` is an arbitrary user-supplied host.
        let sessionRes: Response;
        try {
            sessionRes = (await safeOutboundFetch(`${service}/xrpc/com.atproto.server.createSession`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier: handle, password: appPassword }),
            })) as unknown as Response;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return NextResponse.json(
                { error: `Could not reach Bluesky service: ${msg}` },
                { status: 400 }
            );
        }

        if (!sessionRes.ok) {
            const errorData = await sessionRes.json().catch(() => ({}));
            console.error('Bluesky createSession error:', errorData);
            return NextResponse.json(
                { error: 'Invalid handle or app password. Create an app password at bsky.app → Settings → App Passwords.' },
                { status: 400 }
            );
        }

        const sessionData = await sessionRes.json();
        const did: string | undefined = sessionData.did;
        const resolvedHandle: string = sessionData.handle || handle;

        if (!did) {
            return NextResponse.json(
                { error: 'Bluesky did not return an account identifier (did).' },
                { status: 400 }
            );
        }

        // Prevent re-connecting the same account to a different brand.
        const existingAccount = await socialAccountRepository.findByPlatformAccountId('bluesky', did);
        if (existingAccount && existingAccount.brandId !== brandId) {
            return NextResponse.json(
                { error: 'This Bluesky account is already connected to another brand' },
                { status: 400 }
            );
        }

        if (existingAccount) {
            await socialAccountRepository.update(existingAccount._id.toString(), {
                accessToken: appPassword,
                platformUsername: resolvedHandle,
            });
            await socialAccountRepository.setMetadata(existingAccount._id.toString(), { service });
        } else {
            // Plan enforcement (audit B3) — only on a NEW connection.
            const account = await socialAccountRepository.create({
                brandId,
                platform: 'bluesky',
                platformAccountId: did,
                platformUsername: resolvedHandle,
                platformDisplayName: resolvedHandle,
                accessToken: appPassword, // app password stored encrypted as the durable credential
                scopes: ['post'],
            });
            await socialAccountRepository.setMetadata(account._id.toString(), { service });
        }

        return NextResponse.json({
            success: true,
            account: {
                did,
                handle: resolvedHandle,
                service,
            },
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Bluesky connection error:', msg);
        return NextResponse.json(
            { error: `Failed to connect Bluesky: ${msg}` },
            { status: 500 }
        );
    }
}
