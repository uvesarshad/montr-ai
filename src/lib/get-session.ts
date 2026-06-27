import 'server-only';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { setSentryUser } from '@/lib/observability/sentry-user';

export type { AppSessionUser, AppSession } from '@/lib/session-types';
import type { AppSession } from '@/lib/session-types';

/**
 * Resolve the current request's session on the server (route handlers, server
 * components, server actions). Returns `AppSession | null` — the drop-in
 * replacement for the NextAuth `auth()` helper, so `session?.user?.id | role |
 * organizationId | email` keep working unchanged.
 */
export async function getSession(): Promise<AppSession | null> {
    const result = await auth.api.getSession({ headers: await headers() });
    const session = (result as AppSession | null) ?? null;
    setSentryUser(session?.user as any); // best-effort telemetry tagging
    return session;
}
