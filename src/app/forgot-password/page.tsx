'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { AuthLayout } from '@/components/auth-layout';
import { Loader2, ArrowLeft, Mail, CheckCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
    const { toast } = useToast();
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [recaptchaToken] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const response = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, recaptchaToken }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to send reset email');
            }

            setIsSubmitted(true);
        } catch (error: unknown) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: error instanceof Error ? error.message : String(error),
            });
        } finally {
            setIsLoading(false);
        }
    };

    if (isSubmitted) {
        return (
            <AuthLayout>
                <div className="text-center border p-8 rounded-xl shadow-sm bg-card">
                    <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                        <CheckCircle className="size-8 text-green-600 dark:text-green-400" />
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight">Check Your Email</h2>
                    <p className="text-sm text-muted-foreground mt-4">
                        If an account exists for <span className="font-medium text-foreground">{email}</span>, you will receive a password reset link shortly.
                    </p>

                    <div className="pt-6 space-y-4">
                        <p className="text-center text-xs text-muted-foreground mb-4">
                            Didn&apos;t receive the email? Check your spam folder or try again.
                        </p>
                        <Button variant="outline" className="w-full" onClick={() => setIsSubmitted(false)}>
                            Try another email
                        </Button>
                        <Link href="/login" className="block">
                            <Button variant="ghost" className="w-full mt-2">
                                <ArrowLeft className="mr-2 size-4" />
                                Back to login
                            </Button>
                        </Link>
                    </div>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout>
            <div className="flex flex-col space-y-2 text-center">
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
                    <Mail className="size-6 text-primary" />
                </div>
                <h2 className="text-3xl font-bold tracking-tight">Forgot Password?</h2>
                <p className="text-sm text-muted-foreground">
                    Enter your email address and we&apos;ll send you a link to reset your password.
                </p>
            </div>

            <div className="space-y-6 mt-8">
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={isLoading}
                        />
                    </div>

                    {/* TEMPORARILY DISABLED CAPTCHA
                    {process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY && (
                        <div className="flex justify-center py-2">
                            <ReCAPTCHA
                                ref={recaptchaRef}
                                size="normal"
                                sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY}
                                onChange={(token) => setRecaptchaToken(token)}
                            />
                        </div>
                    )} */}

                    <Button type="submit" className="w-full" disabled={isLoading}>
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 size-4 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            'Send Reset Link'
                        )}
                    </Button>
                </form>

                <div className="mt-6 text-center">
                    <Link href="/login" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                        <ArrowLeft className="mr-1 inline size-4 align-text-bottom" />
                        Back to login
                    </Link>
                </div>
            </div>
        </AuthLayout>
    );
}
