'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/**
 * Redirect from /auth/signin to /login
 * This page exists for backwards compatibility
 */
import { Suspense } from 'react';

function AuthSigninContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
        router.replace(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }, [router, searchParams]);

    return (
        <div className="flex h-screen w-full items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-muted-foreground">Redirecting to login...</p>
            </div>
        </div>
    );
}

export default function AuthSigninRedirect() {
    return (
        <Suspense fallback={<div className="flex h-screen w-full items-center justify-center"><Loader2 className="size-8 animate-spin text-primary" /></div>}>
            <AuthSigninContent />
        </Suspense>
    );
}
