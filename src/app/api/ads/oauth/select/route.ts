import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { adAccountRepository } from '@/lib/db/repository/ad-account.repository';
import { enqueueSourceMetricsSync } from '@/lib/queue/queue';
import { clearAdsPickerCookies, parseAdPlatform, resolveAdsPickerSession } from '@/lib/ads/ads-oauth-picker';
import { fetchMetaAdAccounts } from '@/lib/ads/meta-ads-oauth';
import { discoverGoogleAdsAccounts } from '@/lib/ads/google-ads-oauth';
import type { CreateAdAccountInput, UpdateAdAccountInput } from '@/lib/db/repository/ad-account.repository';

// Approximate lifetime of a Meta long-lived user token. The token-refresh
// service re-exchanges it well before this.
const META_LONG_LIVED_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000; // ~60 days
// The Google access token was minted minutes ago (picker cookies live 10
// minutes); a conservative remaining lifetime keeps the first sync from
// using a stale token while avoiding an immediate refresh.
const GOOGLE_ACCESS_TOKEN_REMAINING_TTL_MS = 45 * 60 * 1000; // 45 minutes

/**
 * Finalizes the ad-account connection after the user picks an account.
 * POST /api/ads/oauth/select  { platform, assetId }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const platform = parseAdPlatform(body.platform);
        const assetId = typeof body.assetId === 'string' ? body.assetId : null;

        if (!platform || !assetId) {
            return NextResponse.json({ error: 'Invalid selection payload' }, { status: 400 });
        }

        const resolution = await resolveAdsPickerSession(platform);
        if (!resolution.ok) {
            return NextResponse.json({ error: resolution.error }, { status: resolution.status });
        }

        const { userId, brandId, accessToken, refreshToken } = resolution.data;

        // Re-fetch server-side and locate the selected asset — the client
        // only ever sends an ID, never account data or tokens.
        let createInput: CreateAdAccountInput | null = null;
        let updateInput: UpdateAdAccountInput | null = null;

        if (platform === 'meta_ads') {
            const asset = (await fetchMetaAdAccounts(accessToken)).find((candidate) => candidate.id === assetId);
            if (!asset) {
                return NextResponse.json({ error: 'Selected ad account not found' }, { status: 404 });
            }

            const tokenExpiresAt = new Date(Date.now() + META_LONG_LIVED_TOKEN_TTL_MS);
            const metaMetadata = {
                businessId: asset.businessId,
                businessName: asset.businessName,
                accountStatus: asset.accountStatus,
            };

            createInput = {
                brandId,
                userId,
                platform,
                externalAccountId: asset.id,
                accountName: asset.name,
                currencyCode: asset.currencyCode,
                timezone: asset.timezone,
                accessToken,
                tokenExpiresAt,
                scopes: ['ads_read', 'ads_management', 'business_management'],
                metaMetadata,
            };
            updateInput = {
                accessToken,
                tokenExpiresAt,
                accountName: asset.name,
                currencyCode: asset.currencyCode,
                timezone: asset.timezone,
                metaMetadata,
                lastError: '',
            };
        } else {
            const asset = (await discoverGoogleAdsAccounts(accessToken)).find((candidate) => candidate.id === assetId);
            if (!asset) {
                return NextResponse.json({ error: 'Selected ad account not found' }, { status: 404 });
            }
            if (asset.isManager) {
                return NextResponse.json(
                    { error: 'Manager (MCC) accounts cannot be connected directly. Connect a client account instead.' },
                    { status: 400 },
                );
            }

            const tokenExpiresAt = new Date(Date.now() + GOOGLE_ACCESS_TOKEN_REMAINING_TTL_MS);
            const googleMetadata = {
                loginCustomerId: asset.loginCustomerId,
                isManager: asset.isManager,
                isTestAccount: asset.isTestAccount,
            };

            createInput = {
                brandId,
                userId,
                platform,
                externalAccountId: asset.id,
                accountName: asset.name,
                currencyCode: asset.currencyCode,
                timezone: asset.timezone,
                accessToken,
                refreshToken,
                tokenExpiresAt,
                scopes: ['adwords'],
                // "Google key" the user pastes into their lead form webhook
                // config — routes lead deliveries back to this connection.
                webhookKey: crypto.randomBytes(16).toString('hex'),
                googleMetadata,
            };
            updateInput = {
                accessToken,
                refreshToken,
                tokenExpiresAt,
                accountName: asset.name,
                currencyCode: asset.currencyCode,
                timezone: asset.timezone,
                googleMetadata,
                lastError: '',
            };
        }

        const existingAccount = await adAccountRepository.findByExternalAccountId(platform, assetId);
        if (existingAccount && existingAccount.brandId !== brandId) {
            return NextResponse.json(
                { error: 'This ad account is already connected to another brand' },
                { status: 409 },
            );
        }

        let connectionId: string;
        if (existingAccount) {
            await adAccountRepository.update(existingAccount._id.toString(), { ...updateInput, isActive: true });
            connectionId = existingAccount._id.toString();
        } else {
            const created = await adAccountRepository.create(createInput);
            connectionId = created._id.toString();
        }

        // Kick off the initial 90-day insights backfill (no-op if Redis is down;
        // the 6-hourly cron will still pick the account up go-forward)
        await enqueueSourceMetricsSync(platform, connectionId, 90, 'backfill');

        await clearAdsPickerCookies(platform);

        return NextResponse.json({ connected: platform });
    } catch (error) {
        console.error('Ads OAuth selection error:', error);
        return NextResponse.json({ error: 'Failed to finalize ad account connection' }, { status: 500 });
    }
}
