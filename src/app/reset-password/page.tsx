'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowLeft, Lock, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AuthLayout } from '@/components/auth-layout';

const calculatePasswordStrength = (password: string) => {
    if (!password) return { width: '0%', color: 'bg-gray-200', label: '' };
    let s = 0;
    if (password.length > 5) s += 1;
    if (password.length > 7) s += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) s += 1;
    if (/\d/.test(password)) s += 1;
    if (/[^a-zA-Z0-9]/.test(password)) s += 1;

    if (s < 2) return { width: '25%', color: 'bg-red-500', label: 'Weak' };
    if (s === 2) return { width: '50%', color: 'bg-yellow-500', label: 'Fair' };
    if (s === 3) return { width: '75%', color: 'bg-blue-500', label: 'Good' };
    return { width: '100%', color: 'bg-green-500', label: 'Strong' };
};

function ResetPasswordContent() {
    const _router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    const token = searchParams.get('token');

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [isValidToken, setIsValidToken] = useState<boolean | null>(null);

    const verifyToken = useCallback(async () => {
        try {
            const response = await fetch(`/api/auth/verify-reset-token?token=${token}`);
            setIsValidToken(response.ok);
        } catch {
            setIsValidToken(false);
        }
    }, [token]);

    useEffect(() => {
        // Verify token on mount
        if (token) {
            verifyToken();
        } else {
            setIsValidToken(false);
        }
    }, [token, verifyToken]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            toast({
                variant: 'destructive',
                title: 'Passwords do not match',
                description: 'Please make sure both passwords are the same.',
            });
            return;
        }

        if (password.length < 6) {
            toast({
                variant: 'destructive',
                title: 'Password too short',
                description: 'Password must be at least 6 characters.',
            });
            return;
        }

        setIsLoading(true);

        try {
            const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to reset password');
            }

            setIsSuccess(true);
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

    const strength = calculatePasswordStrength(password);

    return (
        <AuthLayout>
            <div className="flex flex-col space-y-2 text-center">
                {/* Dynamic headers depending on state */}
                {isValidToken === null ? (
                    <>
                        <h2 className="text-3xl font-bold tracking-tight">Verifying</h2>
                        <p className="text-sm text-muted-foreground">Checking your reset link...</p>
                    </>
                ) : !isValidToken ? (
                    <>
                        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
                            <XCircle className="size-6 text-red-600 dark:text-red-400" />
                        </div>
                        <h2 className="text-3xl font-bold tracking-tight">Invalid Link</h2>
                        <p className="text-sm text-muted-foreground">This password reset link is invalid or has expired.</p>
                    </>
                ) : isSuccess ? (
                    <>
                        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
                            <CheckCircle className="size-6 text-green-600 dark:text-green-400" />
                        </div>
                        <h2 className="text-3xl font-bold tracking-tight">Password Reset!</h2>
                        <p className="text-sm text-muted-foreground">Your password has been successfully reset. You can now sign in.</p>
                    </>
                ) : (
                    <>
                        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
                            <Lock className="size-6 text-primary" />
                        </div>
                        <h2 className="text-3xl font-bold tracking-tight">Reset Password</h2>
                        <p className="text-sm text-muted-foreground">Enter your new password below to reset.</p>
                    </>
                )}
            </div>

            <div className="space-y-6">
                {isValidToken === null ? (
                    <div className="flex flex-col items-center justify-center py-6">
                        <Loader2 className="size-8 animate-spin text-primary" />
                    </div>
                ) : !isValidToken ? (
                    <div className="space-y-4">
                        <Link href="/forgot-password">
                            <Button className="w-full">Request a new link</Button>
                        </Link>
                        <Link href="/login">
                            <Button variant="ghost" className="w-full">
                                <ArrowLeft className="mr-2 size-4" />
                                Back to login
                            </Button>
                        </Link>
                    </div>
                ) : isSuccess ? (
                    <div className="space-y-4">
                        <Link href="/login">
                            <Button className="w-full">Sign in</Button>
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="password">New Password</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    disabled={isLoading}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                    onClick={() => setShowPassword(!showPassword)}
                                    disabled={isLoading}
                                >
                                    {showPassword ? (
                                        <EyeOff className="size-4 text-muted-foreground" />
                                    ) : (
                                        <Eye className="size-4 text-muted-foreground" />
                                    )}
                                    <span className="sr-only">
                                        {showPassword ? "Hide password" : "Show password"}
                                    </span>
                                </Button>
                            </div>
                            {/* Strength indicator */}
                            {password.length > 0 && (
                                <div className="mt-2 flex flex-col gap-1">
                                    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                                        <div
                                            className={`h-full transition-all duration-300 ease-in-out ${strength.color}`}
                                            style={{ width: strength.width }}
                                        />
                                    </div>
                                    <p className={`text-xs text-right font-medium text-muted-foreground`}>
                                        {strength.label}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirm New Password</Label>
                            <div className="relative">
                                <Input
                                    id="confirmPassword"
                                    type={showConfirmPassword ? "text" : "password"}
                                    placeholder="••••••••"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    disabled={isLoading}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    disabled={isLoading}
                                >
                                    {showConfirmPassword ? (
                                        <EyeOff className="size-4 text-muted-foreground" />
                                    ) : (
                                        <Eye className="size-4 text-muted-foreground" />
                                    )}
                                    <span className="sr-only">
                                        {showConfirmPassword ? "Hide password" : "Show password"}
                                    </span>
                                </Button>
                            </div>
                        </div>

                        <Button type="submit" className="w-full mt-4" disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                    Resetting...
                                </>
                            ) : (
                                'Reset Password'
                            )}
                        </Button>
                    </form>
                )}

            </div>
        </AuthLayout>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center p-4">
                <Loader2 className="size-8 animate-spin text-primary" />
            </div>
        }>
            <ResetPasswordContent />
        </Suspense>
    );
}
