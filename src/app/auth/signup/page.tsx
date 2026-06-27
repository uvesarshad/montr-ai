'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * Redirect from /auth/signup to /signup
 * This page exists for backwards compatibility
 */
export default function AuthSignupRedirect() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/signup');
    }, [router]);

    return (
        <div className="flex h-screen w-full items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Redirecting to signup...</p>
            </div>
        </div>
    );
}
