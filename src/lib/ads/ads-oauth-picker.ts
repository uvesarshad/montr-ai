/**
 * Shared session resolution for the ad-account picker step
 * (/api/ads/oauth/assets + /api/ads/oauth/select).
 *
 * Mirrors the brand-access checks of /api/social/oauth/meta/{assets,select}.
 */
import { cookies } from 'next/headers';
import { getSession } from '@/lib/get-session';
import { brandRepository } from '@/lib/db/repository/brand.repository';
import type { AdPlatform } from '@/lib/db/models/ad-account.model';
import { getMetaAdsOAuthCookieNames } from '@/lib/ads/meta-ads-oauth';
import { getGoogleAdsOAuthCookieNames } from '@/lib/ads/google-ads-oauth';

export function parseAdPlatform(value: unknown): AdPlatform | null {
    return value === 'google_ads' || value === 'meta_ads' ? value : null;
}

export interface AdsPickerSession {
    userId: string;
    brandId: string;
    accessToken: string;
    refreshToken?: string;
}

export type AdsPickerResolution =
    | { ok: true; data: AdsPickerSession }
    | { ok: false; status: number; error: string };

export async function resolveAdsPickerSession(platform: AdPlatform): Promise<AdsPickerResolution> {
    const session = await getSession();
    if (!session?.user?.id) {
        return { ok: false, status: 401, error: 'Unauthorized' };
    }

    const cookieStore = await cookies();

    let brandId: string | undefined;
    let accessToken: string | undefined;
    let refreshToken: string | undefined;

    if (platform === 'meta_ads') {
        const names = getMetaAdsOAuthCookieNames();
        brandId = cookieStore.get(names.brandId)?.value;
        accessToken = cookieStore.get(names.userToken)?.value;
    } else {
        const names = getGoogleAdsOAuthCookieNames();
        brandId = cookieStore.get(names.brandId)?.value;
        accessToken = cookieStore.get(names.accessToken)?.value;
        refreshToken = cookieStore.get(names.refreshToken)?.value;
    }

    if (!brandId || !accessToken) {
        return { ok: false, status: 400, error: 'Missing OAuth session data' };
    }

    const brand = await brandRepository.findById(brandId);
    if (!brand) {
        return { ok: false, status: 404, error: 'Brand not found' };
    }

    const hasAccess = brand.userId === session.user.id! ||
        (brand.userId && brand.userId === session.user.id);

    if (!hasAccess) {
        return { ok: false, status: 403, error: 'Forbidden' };
    }
    return {
        ok: true,
        data: {
            userId: session.user.id!,
            brandId,
            accessToken,
            refreshToken,
        },
    };
}

export async function clearAdsPickerCookies(platform: AdPlatform): Promise<void> {
    const cookieStore = await cookies();

    if (platform === 'meta_ads') {
        const names = getMetaAdsOAuthCookieNames();
        cookieStore.delete(names.state);
        cookieStore.delete(names.brandId);
        cookieStore.delete(names.userToken);
    } else {
        const names = getGoogleAdsOAuthCookieNames();
        cookieStore.delete(names.state);
        cookieStore.delete(names.brandId);
        cookieStore.delete(names.accessToken);
        cookieStore.delete(names.refreshToken);
    }
}
