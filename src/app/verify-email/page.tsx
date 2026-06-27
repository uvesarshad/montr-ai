'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

function VerifyEmailContent() {
    const searchParams = useSearchParams();
    const email = searchParams.get('email') || '';
    const expired = searchParams.get('expired') === 'true';
    const { toast } = useToast();

    const [isResending, setIsResending] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [resent, setResent] = useState(false);

    // Cooldown timer
    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setInterval(() => {
            setCooldown((prev) => prev - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [cooldown]);

    // Show expired toast on mount
    useEffect(() => {
        if (expired) {
            toast({
                variant: 'destructive',
                title: 'Link expired',
                description: 'Your verification link has expired. Please request a new one.',
            });
        }
    }, [expired, toast]);

    const handleResend = async () => {
        if (!email || cooldown > 0) return;
        setIsResending(true);

        try {
            const response = await fetch('/api/auth/resend-verification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to resend verification email');
            }

            setResent(true);
            setCooldown(60);
            toast({
                title: 'Email sent!',
                description: 'A new verification link has been sent to your email.',
            });
        } catch (error: unknown) {
            toast({
                variant: 'destructive',
                title: 'Failed to resend',
                description: error instanceof Error ? error.message : String(error),
            });
        } finally {
            setIsResending(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-primary/10">
                        <Mail className="size-8 text-primary" />
                    </div>
                    <CardTitle className="text-2xl font-bold">Check your email</CardTitle>
                    <CardDescription className="mt-2">
                        {email ? (
                            <>
                                We&apos;ve sent a verification link to{' '}
                                <span className="font-medium text-foreground">{email}</span>
                            </>
                        ) : (
                            'We\'ve sent a verification link to your email address'
                        )}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="rounded-lg border border-muted bg-muted/50 p-4">
                        <div className="flex items-start gap-3">
                            <CheckCircle2 className="mt-0.5 size-5 flex-shrink-0 text-primary" />
                            <div className="text-sm text-muted-foreground">
                                <p className="font-medium text-foreground">What to do next:</p>
                                <ol className="mt-1 list-inside list-decimal space-y-1">
                                    <li>Open your email inbox</li>
                                    <li>Click the verification link in the email</li>
                                    <li>You&apos;ll be redirected to sign in</li>
                                </ol>
                            </div>
                        </div>
                    </div>

                    {expired && (
                        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="mt-0.5 size-5 flex-shrink-0 text-destructive" />
                                <p className="text-sm text-destructive">
                                    Your previous verification link has expired. Click the button below to get a new one.
                                </p>
                            </div>
                        </div>
                    )}

                    {email && (
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={handleResend}
                            disabled={isResending || cooldown > 0}
                        >
                            {isResending ? (
                                <>
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                    Sending...
                                </>
                            ) : cooldown > 0 ? (
                                `Resend in ${cooldown}s`
                            ) : resent ? (
                                'Resend verification email'
                            ) : (
                                "Didn't receive the email? Resend"
                            )}
                        </Button>
                    )}

                    <div className="text-center text-sm text-muted-foreground">
                        <p>
                            Already verified?{' '}
                            <Link href="/login" className="text-primary hover:underline">
                                Sign in
                            </Link>
                        </p>
                    </div>

                    <p className="text-center text-xs text-muted-foreground">
                        Don&apos;t forget to check your spam folder if you don&apos;t see the email.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center p-4">
                    <Loader2 className="size-8 animate-spin text-primary" />
                </div>
            }
        >
            <VerifyEmailContent />
        </Suspense>
    );
}
