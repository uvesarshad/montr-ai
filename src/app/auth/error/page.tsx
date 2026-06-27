'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const errorMessages: Record<string, string> = {
    Configuration: 'There is a problem with the server configuration. Check your environment variables.',
    AccessDenied: 'You do not have permission to sign in.',
    Verification: 'The verification token has expired or has already been used.',
    Default: 'An error occurred during authentication.',
};

import { Suspense } from 'react';

function AuthErrorContent() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error') || 'Default';

    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle className="text-2xl font-bold text-destructive">
                    Authentication Error
                </CardTitle>
                <CardDescription>
                    {errorMessages[error] || errorMessages.Default}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="p-4 bg-destructive/10 rounded-md">
                    <p className="text-sm font-mono">Error: {error}</p>
                </div>

                <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                        If this problem persists, please check:
                    </p>
                    <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                        <li>Environment variables are correctly set</li>
                        <li>Google OAuth credentials (if using Google sign-in)</li>
                        <li>NEXTAUTH_SECRET is generated</li>
                    </ul>
                </div>

                <div className="flex gap-2">
                    <Button asChild className="flex-1">
                        <Link href="/auth/signin">Try Again</Link>
                    </Button>
                    <Button asChild variant="outline" className="flex-1">
                        <Link href="/">Go Home</Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

export default function AuthErrorPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Suspense fallback={<Card className="w-full max-w-md p-6"><div className="flex justify-center"><div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full"></div></div></Card>}>
                <AuthErrorContent />
            </Suspense>
        </div>
    );
}
