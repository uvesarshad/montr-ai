/**
 * Social OAuth engine — one implementation of the OAuth dance for every
 * social platform (legacy per-provider routes consolidated 2026-06-05).
 *
 * Flow:
 *   GET /api/social/oauth/[platform]            -> initiateSocialOAuth()
 *   GET /api/social/oauth/[platform]/callback   -> handleSocialOAuthCallback()
 *
 * Redirect URIs keep the per-platform path, so nothing changes on the
 * provider-app side. Cookie names are standardized (social_oauth_*) — safe
 * because initiate and callback always run as a pair.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { getSession } from '@/lib/get-session';
import type { PersistResult, SocialOAuthPlatformConfig } from './types';
import { getSocialOAuthPlatform } from './platforms';
import { buildAuthorizationUrl, exchangeCode } from './exchange';
import brandRepository from '@/lib/db/repository/brand.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import {
    checkSocialPlanLimit,
    countAccountsForBrand,
    isPlatformAllowed,
} from '@/lib/social/plan-limits';

// Pure helpers live in exchange.ts (unit-testable, no next/auth deps);
// platform configs import them from here for convenience.
export { buildAuthorizationUrl, exchangeCode, expiresInToDate } from './exchange';

const COOKIES = {
    state: 'social_oauth_state',
    platform: 'social_oauth_platform',
    brandId: 'social_oauth_brand_id',
    verifier: 'social_oauth_verifier',
    extra: 'social_oauth_extra',
} as const;

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 600, // 10 minutes
    path: '/',
};

function appUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL || '';
}

function redirectUriFor(config: SocialOAuthPlatformConfig): string {
    if (config.redirectUriOverride) return config.redirectUriOverride();
    return `${appUrl()}/api/social/oauth/${config.platform}/callback`;
}

function errorRedirect(
    config: SocialOAuthPlatformConfig | null,
    code: string,
    extra?: Record<string, string>
): string {
    if (config?.errorRedirect) return `${appUrl()}${config.errorRedirect(code, extra)}`;
    return `${appUrl()}/social/oauth-callback?error=${encodeURIComponent(code)}`;
}

/**
 * GET /api/social/oauth/[platform]?brandId=…(&type=…&source=…)
 */
export async function initiateSocialOAuth(platform: string, request: NextRequest): Promise<NextResponse> {
    const config = getSocialOAuthPlatform(platform);
    if (!config) {
        return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 404 });
    }

    const clientId = process.env[config.clientIdEnv];
    if (!clientId) {
        return NextResponse.json(
            { error: `${config.platform} OAuth is not configured. Missing ${config.clientIdEnv}.` },
            { status: 500 }
        );
    }

    const { searchParams } = new URL(request.url);

    // Carry declared initiate params (linkedin type, gmail/outlook source)
    // through the flow.
    const extra: Record<string, string> = {};
    for (const param of config.passthroughParams || []) {
        const value = searchParams.get(param);
        if (value) extra[param] = value;
    }

    // gmail/outlook CRM flows run brand-less (?source=crm only).
    const brandId = searchParams.get('brandId');
    if (!brandId && !config.allowMissingBrand?.(extra)) {
        return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
    }

    const state = crypto.randomBytes(16).toString('hex');
    let codeChallenge: string | undefined;
    let verifier = '';
    if (config.pkce) {
        verifier = crypto.randomBytes(32).toString('base64url');
        codeChallenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    }

    const cookieStore = await cookies();
    cookieStore.set(COOKIES.state, state, COOKIE_OPTIONS);
    cookieStore.set(COOKIES.platform, platform, COOKIE_OPTIONS);
    cookieStore.set(COOKIES.brandId, brandId || '', COOKIE_OPTIONS);
    cookieStore.set(COOKIES.verifier, verifier, COOKIE_OPTIONS);
    cookieStore.set(COOKIES.extra, JSON.stringify(extra), COOKIE_OPTIONS);

    const authUrl = buildAuthorizationUrl(config, {
        clientId,
        redirectUri: redirectUriFor(config),
        state,
        extra,
        codeChallenge,
    });

    return NextResponse.redirect(authUrl);
}

/**
 * GET /api/social/oauth/[platform]/callback?code=...&state=...
 */
export async function handleSocialOAuthCallback(platform: string, request: NextRequest): Promise<NextResponse> {
    const config = getSocialOAuthPlatform(platform);
    if (!config) {
        return NextResponse.redirect(errorRedirect(null, 'unknown_platform'));
    }

    // Hoisted so the catch block can route errors per-flow (outlook CRM).
    let extra: Record<string, string> = {};

    try {
        const session = await getSession();
        const userId = (session?.user as { id?: string } | undefined)?.id;
        if (!userId) {
            return NextResponse.redirect(errorRedirect(config, 'not_authenticated'));
        }

        const { searchParams } = new URL(request.url);
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const providerError = searchParams.get('error');

        if (providerError) {
            console.error(`[social-oauth] ${platform} provider error:`, providerError);
            return NextResponse.redirect(errorRedirect(config, providerError));
        }
        if (!code || !state) {
            return NextResponse.redirect(errorRedirect(config, 'missing_params'));
        }

        const cookieStore = await cookies();
        const storedState = cookieStore.get(COOKIES.state)?.value;
        const storedPlatform = cookieStore.get(COOKIES.platform)?.value;
        const brandId = cookieStore.get(COOKIES.brandId)?.value;
        const verifier = cookieStore.get(COOKIES.verifier)?.value || '';
        try {
            extra = JSON.parse(cookieStore.get(COOKIES.extra)?.value || '{}');
        } catch {
            extra = {};
        }

        for (const name of Object.values(COOKIES)) {
            cookieStore.delete(name);
        }

        if (!storedState || state !== storedState || storedPlatform !== platform) {
            return NextResponse.redirect(errorRedirect(config, 'invalid_state', extra));
        }
        if (brandId === undefined || (!brandId && !config.allowMissingBrand?.(extra))) {
            return NextResponse.redirect(errorRedirect(config, 'missing_session', extra));
        }

        // Plan enforcement (audit B3) — gate the connection at the one choke
        // point where every publishing platform converges. Only applies to
        // brand-scoped flows; org-less / CRM (gmail/outlook/calendar) flows that
        // run without a brandId are skipped. Org-less brands aren't capped.
        if (brandId) {
            const brand = await brandRepository.findById(brandId);
            const orgId =
                brand?.userId ||
                (await userRepository.findById(userId))?.id ||
                null;
            if (orgId) {
                if (!(await isPlatformAllowed(orgId, platform))) {
                    return NextResponse.redirect(errorRedirect(config, 'plan_platform_not_allowed', extra));
                }
                const accountCheck = await checkSocialPlanLimit(
                    orgId,
                    'maxSocialAccountsPerBrand',
                    () => countAccountsForBrand(brandId)
                );
                if (!accountCheck.allowed) {
                    return NextResponse.redirect(errorRedirect(config, 'plan_account_limit', extra));
                }
            }
        }

        const redirectUri = redirectUriFor(config);
        const tokens = await exchangeCode(config, { code, redirectUri, verifier });

        const result = await config.persist(tokens, {
            platform,
            brandId,
            userId,
            extra,
            redirectUri,
        });

        const persist: PersistResult = typeof result === 'string' ? { redirect: result } : result;
        const target = persist.redirect.startsWith('http')
            ? persist.redirect
            : `${appUrl()}${persist.redirect}`;
        const response = NextResponse.redirect(target);
        for (const cookie of persist.cookies || []) {
            response.cookies.set(cookie.name, cookie.value, {
                ...COOKIE_OPTIONS,
                maxAge: cookie.maxAge ?? COOKIE_OPTIONS.maxAge,
            });
        }
        return response;
    } catch (error) {
        console.error(`[social-oauth] ${platform} callback error:`, error);
        return NextResponse.redirect(errorRedirect(config, 'callback_failed', extra));
    }
}
