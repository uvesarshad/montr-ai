/**
 * Shared session/org resolution for the integrations API routes.
 *
 * Multi-tenancy hard rule: organizationId is always read from the session
 * user's DB record — never from the client.
 */

import { getSession } from '@/lib/get-session';

export interface IntegrationRequestContext {
    userId: string;
}

export async function resolveIntegrationContext(): Promise<
    | { ok: true; context: IntegrationRequestContext }
    | { ok: false; status: number; error: string }
> {
    const session = await getSession();
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
        return { ok: false, status: 401, error: 'Unauthorized' };
    }
    return { ok: true, context: { userId } };
}
