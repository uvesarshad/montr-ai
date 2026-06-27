'use client';

import { useMemo } from 'react';
import { useSession } from '@/lib/auth-client';

interface MappedUser {
  uid?: string;
  id?: string;
  emailVerified: boolean;
  photoURL?: string | null;
  displayName?: string | null;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  twoFactorEnabled?: boolean;
  [key: string]: unknown;
}

interface UserHookResult {
  user: MappedUser | null;
  isUserLoading: boolean;
  userError: Error | null;
}

export const useUser = (): UserHookResult => {
  const { data: session, status } = useSession();

  const isLoading = status === 'loading';

  // Map NextAuth user to be compatible with existing code that might expect 'uid'
  const user = useMemo(() => {
    return session?.user ? {
      ...session.user,
      uid: session.user.id || (session.user as { uid?: string }).uid,
      emailVerified: true, // Mocked for now
      photoURL: session.user.image,
      displayName: session.user.name,
      twoFactorEnabled: (session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled,
    } : null;
  }, [session]);

  const result = useMemo(() => ({
    user,
    isUserLoading: isLoading,
    userError: null
  }), [user, isLoading]);

  return result;
};
