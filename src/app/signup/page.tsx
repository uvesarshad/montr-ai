'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import Link from 'next/link';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Eye, EyeOff, Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AuthLayout } from '@/components/auth-layout';
function SignUpContent() {
  const { push: routerPush } = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [showOtpFlow, setShowOtpFlow] = useState(false);
  const [otpStep, setOtpStep] = useState(1);
  const [otpCode, setOtpCode] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);

  const [recaptchaToken] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: callbackUrl,
    });
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Google sign-in failed',
        description: error.message || 'Unable to continue with Google.',
      });
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingOtp(true);

    // TEMPORARILY DISABLED CAPTCHA
    // if (!recaptchaToken && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
    //   toast({
    //     variant: 'destructive',
    //     title: 'reCAPTCHA required',
    //     description: 'Please complete the reCAPTCHA challenge.',
    //   });
    //   setIsSendingOtp(false);
    //   return;
    // }

    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: 'sign-in',
      });

      if (error) throw new Error(error.message || 'Failed to send OTP');

      setOtpStep(2);
      toast({
        title: 'OTP Sent',
        description: 'A 6-digit code has been sent to your email.',
      });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Failed to send OTP',
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await authClient.signIn.emailOtp({
        email,
        otp: otpCode,
      });

      if (error) {
        toast({
          variant: 'destructive',
          title: 'Verification failed',
          description: error.message || 'The code is invalid or has expired.',
        });
      } else {
        routerPush(callbackUrl);
      }
    } catch {
      toast({
        variant: 'destructive',
        title: 'Verification failed',
        description: 'An error occurred while verifying the code.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // TEMPORARILY DISABLED CAPTCHA
    // if (!recaptchaToken && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
    //   toast({
    //     variant: 'destructive',
    //     title: 'reCAPTCHA required',
    //     description: 'Please complete the reCAPTCHA challenge.',
    //   });
    //   setIsLoading(false);
    //   return;
    // }

    // Validation
    if (password !== confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Passwords do not match',
        description: 'Please make sure both passwords are the same.',
      });
      setIsLoading(false);
      return;
    }

    if (password.length < 12) {
      toast({
        variant: 'destructive',
        title: 'Password too short',
        description: 'Password must be at least 12 characters.',
      });
      setIsLoading(false);
      return;
    }

    try {
      // BetterAuth email/password sign up. The server sends the verification
      // email automatically (emailVerification.sendOnSignUp), so we surface the
      // "check your email" success state instead of navigating to the dashboard.
      const { error } = await authClient.signUp.email({
        email,
        password,
        name,
        callbackURL: callbackUrl,
      });

      if (error) {
        const alreadyExists =
          error.status === 422 || error.code === 'USER_ALREADY_EXISTS';
        throw new Error(
          alreadyExists
            ? 'An account with this email already exists'
            : error.message || 'Failed to create account',
        );
      }

      toast({
        title: 'Account created!',
        description: 'Please check your email to verify your account.',
      });

      // Email must be verified before signing in — show the verify-email state.
      routerPush(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Sign up failed',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="flex flex-col space-y-2 text-center">
        <h2 className="text-3xl font-bold tracking-tight">Create an account</h2>
        <p className="text-sm text-muted-foreground">
          Sign up to get started with Montr AI
        </p>
      </div>

      <div className="space-y-6">
        {/* Google Sign In - only show if configured */}
        {process.env.NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED === 'true' && (
          <Button
            variant="outline"
            className="w-full"
            onClick={handleGoogleSignIn}
            disabled={isLoading || isSendingOtp}
          >
            <Icons.google className="mr-2 size-4" />
            Continue with Google
          </Button>
        )}

        {!showOtpFlow && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowOtpFlow(true)}
            disabled={isLoading || isSendingOtp}
          >
            <Mail className="mr-2 size-4" />
            Continue with Email OTP
          </Button>
        )}

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">
              Or continue with email
            </span>
          </div>
        </div>

        {/* OTP Form */}
        {showOtpFlow ? (
          otpStep === 1 ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp-email">Email</Label>
                <Input
                  id="otp-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isSendingOtp}
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

              <Button type="submit" className="w-full" disabled={isSendingOtp}>
                {isSendingOtp ? 'Sending Code...' : 'Send Login Code'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setShowOtpFlow(false)}>
                Back to Password Signup
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp-code">Enter 6-digit Code</Label>
                <Input
                  id="otp-code"
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  required
                  className="text-center text-lg tracking-widest"
                  maxLength={6}
                  disabled={isLoading}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground text-center">
                  Code sent to {email}
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Verifying...' : 'Verify & Sign In'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => { setOtpStep(1); setOtpCode(''); }}>
                Request New Code
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setShowOtpFlow(false)}>
                Cancel
              </Button>
            </form>
          )
        ) : (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </Button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary font-semibold hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background p-4"><Loader2 className="size-8 animate-spin text-primary" /></div>}>
      <SignUpContent />
    </Suspense>
  );
}
