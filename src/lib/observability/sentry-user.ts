import * as Sentry from '@sentry/nextjs';

/**
 * Tag the current Sentry scope with the authenticated user/org/role so
 * server-side events are attributable. NO email or other PII is sent
 * (PII decision #4). Always best-effort — never throws from telemetry.
 */
export function setSentryUser(
    user?: { id?: string;
 role?: string } | null,
) {
    try {
        if (!user?.id) {
            Sentry.setUser(null);
            return;
        }
        Sentry.setUser({ id: user.id }); // NO email — PII decision #4
        Sentry.setTag('organizationId', user.id ?? 'none');
        Sentry.setTag('role', user.role ?? 'user');
    } catch {
        /* never throw from telemetry */
    }
}
