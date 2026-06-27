import 'server-only';

import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { isSuperAdminEmail } from '@/lib/auth/super-admin';
import type { IUser } from '@/lib/db/models/user.model';

/**
 * Shared super-admin gate for API routes.
 *
 * Extracts the inline `getSuperAdmin()` pattern duplicated across admin routes:
 * verify the session, load the user from the DB, and confirm the `super_admin`
 * role — re-elevating by the configured super-admin email so a stored-role
 * drift can't silently lock the real super-admin out.
 *
 * Usage:
 *
 *   const guard = await requireSuperAdmin();
 *   if (!guard.ok) {
 *     return NextResponse.json({ error: 'Forbidden' }, { status: guard.status });
 *   }
 *   const { user } = guard;
 */
export type SuperAdminResult =
    | { ok: true; user: IUser }
    | { ok: false; status: 401 | 403 };

export async function requireSuperAdmin(): Promise<SuperAdminResult> {
    const session = await getSession();
    if (!session?.user?.id) {
        return { ok: false, status: 401 };
    }

    const user = await userRepository.findById(session.user.id);
    if (!user) {
        return { ok: false, status: 403 };
    }

    const role = isSuperAdminEmail(user.email)
        ? 'super_admin'
        : (user as { role?: string }).role;

    if (role !== 'super_admin') {
        return { ok: false, status: 403 };
    }

    return { ok: true, user };
}
