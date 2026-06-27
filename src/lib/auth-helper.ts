import { NextRequest } from 'next/server';
import { getSession } from '@/lib/get-session';

export interface AuthUser {
    id: string;
    email?: string;
    name?: string;
    authSource: 'nextauth';
}

/**
 * Get authenticated user from NextAuth
 */
export async function getAuthUser(_request: NextRequest): Promise<AuthUser | null> {
    try {
        const session = await getSession();
        if (session?.user) {
            return {
                id: (session.user as { id?: string }).id || session.user.email || 'unknown',
                email: session.user.email || undefined,
                name: session.user.name || undefined,
                authSource: 'nextauth',
            };
        }
    } catch (error) {
        console.log('NextAuth session check failed:', error);
    }
    return null;
}

/**
 * Simple auth check for v2 APIs
 */
export async function getAuthUserSimple(request: NextRequest): Promise<AuthUser | null> {
    const user = await getAuthUser(request);
    if (user) return user;

    // For testing: accept X-User-Id header (Optional, keep if needed for verify)
    const testUserId = request.headers.get('X-User-Id');
    if (testUserId && process.env.NODE_ENV === 'development') {
        return {
            id: testUserId,
            email: undefined,
            name: 'Test User',
            authSource: 'nextauth', // Just label it nextauth for consistency in types
        };
    }

    return null;
}
