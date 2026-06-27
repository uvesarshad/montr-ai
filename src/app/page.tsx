'use client';

import { useSession } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status !== 'loading') {
      if (session) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
    }
  }, [session, status, router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="size-8 animate-spin text-primary" />
    </div>
  );
}
