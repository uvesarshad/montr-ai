import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { assertBrandAccess, BrandAccessError, brandAccessErrorResponse } from '@/lib/social/brand-access';


import { safeOutboundFetch } from '@/lib/workflow/ssrf-guard';

const bodySchema = z.object({
    brandId: z.string().min(1),
    instanceUrl: z.string().url(),
    accessToken: z.string().min(1),
});

/**
 * Mastodon Connection — per-instance access token, NO platform-wide OAuth.
 *
 * Mastodon is federated: each user lives on their own instance. The user
 * creates an application in their instance's Development settings and pastes
 * the resulting access token together with the instance URL. We verify it via
 * `GET {instance}/api/v1/accounts/verify_credentials` and store the instance
 * URL on the account's `metadata` map (the publish flow reads it back).
 *
 * The instance host is user-supplied, so the verify call goes through
 * `safeOutboundFetch` (SSRF guard) like the WordPress/n8n integrations.
 *
 * POST /api/social/oauth/mastodon
 * Body: { brandId, instanceUrl, accessToken }
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
                { error: 'brandId, instanceUrl and accessToken are required (instanceUrl must be a valid URL)' },
                { status: 400 }
            );
        }

        const { brandId } = parsed.data;
        const accessToken = parsed.data.accessToken.trim();

        // Normalise + sanity-check the instance URL (https origin only).
        let instanceUrl: string;
        try {
            const u = new URL(parsed.data.instanceUrl.trim());
            if (u.protocol !== 'https:') {
                return NextResponse.json(
                    { error: 'Mastodon instance URL must be https.' },
                    { status: 400 }
                );
            }
            instanceUrl = u.origin; // strip any path/query
        } catch {
            return NextResponse.json({ error: 'Invalid instance URL.' }, { status: 400 });
        }

        // Tenancy: confirm the brand belongs to the caller (audit C4).
        try {
            ({ } = await assertBrandAccess(session.user.id, brandId));
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        // Verify the token against the instance. SSRF-guarded because the
        // instance host is arbitrary user input.
        let verifyRes: Response;
        try {
            verifyRes = (await safeOutboundFetch(`${instanceUrl}/api/v1/accounts/verify_credentials`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${accessToken}` },
            })) as unknown as Response;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return NextResponse.json(
                { error: `Could not reach Mastodon instance: ${msg}` },
                { status: 400 }
            );
        }

        if (!verifyRes.ok) {
            const errorData = await verifyRes.json().catch(() => ({}));
            console.error('Mastodon verify_credentials error:', errorData);
            return NextResponse.json(
                { error: 'Invalid access token for this instance. Create an application token in your instance Settings → Development.' },
                { status: 400 }
            );
        }

        const acct = await verifyRes.json();
        const accountId: string | undefined = acct.id?.toString();
        const username: string = acct.username || acct.acct || 'unknown';
        const displayName: string = acct.display_name || username;
        const avatarUrl: string | undefined = acct.avatar;

        if (!accountId) {
            return NextResponse.json(
                { error: 'Mastodon did not return an account id.' },
                { status: 400 }
            );
        }

        // Account ids are only unique within an instance — namespace by host so
        // the same numeric id on two instances doesn't collide.
        const platformAccountId = `${new URL(instanceUrl).host}:${accountId}`;

        const existingAccount = await socialAccountRepository.findByPlatformAccountId('mastodon', platformAccountId);
        if (existingAccount && existingAccount.brandId !== brandId) {
            return NextResponse.json(
                { error: 'This Mastodon account is already connected to another brand' },
                { status: 400 }
            );
        }

        if (existingAccount) {
            await socialAccountRepository.update(existingAccount._id.toString(), {
                accessToken,
                platformUsername: username,
                platformDisplayName: displayName,
                avatarUrl,
            });
            await socialAccountRepository.setMetadata(existingAccount._id.toString(), { instanceUrl });
        } else {
            // Plan enforcement (audit B3) — only on a NEW connection.
            const account = await socialAccountRepository.create({
                brandId,
                platform: 'mastodon',
                platformAccountId,
                platformUsername: username,
                platformDisplayName: displayName,
                avatarUrl,
                accessToken,
                scopes: ['write:statuses', 'write:media'],
            });
            await socialAccountRepository.setMetadata(account._id.toString(), { instanceUrl });
        }

        return NextResponse.json({
            success: true,
            account: {
                id: accountId,
                username,
                displayName,
                instanceUrl,
            },
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Mastodon connection error:', msg);
        return NextResponse.json(
            { error: `Failed to connect Mastodon: ${msg}` },
            { status: 500 }
        );
    }
}
