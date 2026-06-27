/**
 * Shared session resolution for the analytics-source picker step
 * (/api/analytics/oauth/assets + /api/analytics/oauth/select).
 *
 * Mirrors src/lib/ads/ads-oauth-picker.ts for GA4 / Search Console.
 */
import { cookies } from 'next/headers';
import { getSession } from '@/lib/get-session';
import { brandRepository } from '@/lib/db/repository/brand.repository';
import type { AnalyticsSourceType } from '@/lib/db/models/analytics-source.model';
import { getAnalyticsOAuthCookieNames } from '@/lib/analytics/analytics-oauth';

export function parseAnalyticsSourceType(value: unknown): AnalyticsSourceType | null {
    return value === 'ga4' || value === 'search_console' ? value : null;
}

export interface AnalyticsPickerSession {
    userId: string;
    brandId: string;
    accessToken: string;
    refreshToken?: string;
}

export type AnalyticsPickerResolution =
    | { ok: true; data: AnalyticsPickerSession }
    | { ok: false; status: number; error: string };

export async function resolveAnalyticsPickerSession(sourceType: AnalyticsSourceType): Promise<AnalyticsPickerResolution> {
    const session = await getSession();
    if (!session?.user?.id) {
        return { ok: false, status: 401, error: 'Unauthorized' };
    }

    const cookieStore = await cookies();
    const names = getAnalyticsOAuthCookieNames(sourceType);
    const brandId = cookieStore.get(names.brandId)?.value;
    const accessToken = cookieStore.get(names.accessToken)?.value;
    const refreshToken = cookieStore.get(names.refreshToken)?.value;

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

export async function clearAnalyticsPickerCookies(sourceType: AnalyticsSourceType): Promise<void> {
    const cookieStore = await cookies();
    const names = getAnalyticsOAuthCookieNames(sourceType);
    cookieStore.delete(names.state);
    cookieStore.delete(names.brandId);
    cookieStore.delete(names.accessToken);
    cookieStore.delete(names.refreshToken);
}
