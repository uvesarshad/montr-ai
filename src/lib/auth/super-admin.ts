/**
 * Super-admin email resolution.
 *
 * The historical env var name was `NEXT_PUBLIC_SUPER_ADMIN_EMAIL`, which leaked
 * the address into the client bundle and made it a phishing target. Reads of
 * the super-admin email should now use `getSuperAdminEmail()` so we can route
 * everyone through a single, server-only lookup.
 *
 * For one deploy cycle we still fall back to the old public name so existing
 * environments don't break — remove the fallback once `SUPER_ADMIN_EMAIL` is
 * set in every environment.
 */
export function getSuperAdminEmail(): string | null {
    const raw = process.env.SUPER_ADMIN_EMAIL ?? process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL;
    if (!raw) return null;
    return raw.trim().toLowerCase() || null;
}

/**
 * True when the given email matches the configured super-admin address.
 * Case-insensitive; safe to call with `undefined`/`null`.
 */
export function isSuperAdminEmail(email?: string | null): boolean {
    if (!email) return false;
    const target = getSuperAdminEmail();
    return target !== null && email.toLowerCase() === target;
}
