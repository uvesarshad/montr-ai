'use client';

/**
 * BetterAuth browser client. Use for all client-side auth: `authClient.useSession()`,
 * `authClient.signIn.*`, `authClient.signOut()`, `authClient.signUp.email(...)`,
 * and the 2FA / email-OTP / magic-link plugin methods.
 */
import { createAuthClient } from 'better-auth/react';
import { twoFactorClient, emailOTPClient, magicLinkClient } from 'better-auth/client/plugins';
import type { AppSession } from '@/lib/session-types';

export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_APP_URL || undefined,
    plugins: [
        twoFactorClient({
            onTwoFactorRedirect() {
                // Sign-in returned a 2FA challenge — route to the verification step.
                if (typeof window !== 'undefined') {
                    window.location.href = '/login?step=2fa';
                }
            },
        }),
        emailOTPClient(),
        magicLinkClient(),
    ],
});

export const { signIn, signOut, signUp } = authClient;

/**
 * Typed, API-compatible session hook (drop-in for the old NextAuth
 * `useSession`). Wraps `authClient.useSession()` and surfaces:
 *  - `data`: `{ user: AppSessionUser } | null` (explicitly typed — BetterAuth's
 *    own inference drops role/organizationId)
 *  - `status`: `'loading' | 'authenticated' | 'unauthenticated'`
 *  - `update`: refetch (NextAuth called it `update`)
 */
export function useSession() {
    const { data, isPending, error, refetch } = authClient.useSession();
    const status: 'loading' | 'authenticated' | 'unauthenticated' = isPending
        ? 'loading'
        : data
          ? 'authenticated'
          : 'unauthenticated';
    return {
        data: (data as unknown as AppSession | null) ?? null,
        status,
        isPending,
        error,
        update: refetch,
    };
}
