/**
 * Shared session-user shape used on BOTH the server (`getSession`) and the
 * client (`authClient.useSession`). Kept in a neutral module (no `server-only`
 * / no `'use client'`) so both sides can import it. Mirrors the fields the old
 * NextAuth `Session['user']` augmentation exposed.
 */
export interface AppSessionUser {
    id?: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
    emailVerified?: boolean;
    role?: string;
    firebaseUid?: string;
    twoFactorEnabled?: boolean;
    username?: string;
}

export interface AppSession {
    user: AppSessionUser;
    session?: Record<string, unknown>;
}
