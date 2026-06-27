import 'server-only';
import { getSession } from '@/lib/get-session';
import { isSuperAdminEmail } from '@/lib/auth/super-admin';

/**
 * Authoritative server-side auth guards. Because BetterAuth uses DB sessions
 * that can't be validated at the Edge, route handlers / server components must
 * NOT rely on `middleware.ts` alone — call these to enforce access.
 *
 * They return a discriminated result rather than throwing so callers can shape
 * their own 401/403 response (JSON vs redirect).
 */

export type GuardResult =
    | { ok: true; userId: string; role: string;
 email?: string }
    | { ok: false; status: 401 | 403 };

function roleOf(user: { email?: string | null; role?: string | null }): string {
    if (isSuperAdminEmail(user.email)) return 'super_admin';
    return user.role || 'user';
}

/** Require any authenticated user. */
export async function requireUser(): Promise<GuardResult> {
    const session = await getSession();
    const user = session?.user as
        | { id?: string; email?: string; role?: string; }
        | undefined;
    if (!user?.id) return { ok: false, status: 401 };
    return {
        ok: true,
        userId: user.id,
        role: roleOf(user),
        email: user.email,
    };
}

/** Require an admin or super_admin. */
export async function requireAdmin(): Promise<GuardResult> {
    const result = await requireUser();
    if (!result.ok) return result;
    if (result.role !== 'admin' && result.role !== 'super_admin') {
        return { ok: false, status: 403 };
    }
    return result;
}

/** Require the super_admin specifically. */
export async function requireSuperAdmin(): Promise<GuardResult> {
    const result = await requireUser();
    if (!result.ok) return result;
    if (result.role !== 'super_admin') return { ok: false, status: 403 };
    return result;
}
