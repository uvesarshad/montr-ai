'use client';

import { authClient } from '@/lib/auth-client';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Icons } from '@/components/icons';
import Link from 'next/link';
import { Loader2, Eye, EyeOff, Mail } from 'lucide-react';
import { AuthLayout } from '@/components/auth-layout';
function LoginContent() {
  const { push: routerPush } = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const [recaptchaToken] = useState<string | null>(null);

  const verifiedParam = searchParams.get('verified');
  const errorParam = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(errorParam || '');
  const [successMessage, setSuccessMessage] = useState(
    verifiedParam === 'true' ? 'Email verified successfully! You can now sign in.' : ''
  );

  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');

  const [showOtpFlow, setShowOtpFlow] = useState(false);
  const [otpStep, setOtpStep] = useState(1);
  const [otpCode, setOtpCode] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);

  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [isResending, setIsResending] = useState(false);

  const handleResendVerification = async () => {
    if (!unverifiedEmail) return;
    setIsResending(true);
    try {
      const { error: sendError } = await authClient.sendVerificationEmail({
        email: unverifiedEmail,
        callbackURL: '/login',
      });

      if (sendError) {
        throw new Error(sendError.message || 'Failed to resend');
      }

      setSuccessMessage('A new verification link has been sent to your email.');
      setError('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resend verification email');
    } finally {
      setIsResending(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccessMessage('');
    setUnverifiedEmail('');

    // TEMPORARILY DISABLED CAPTCHA
    // if (!recaptchaToken && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
    //   setError('Please complete the reCAPTCHA challenge.');
    //   setIsLoading(false);
    //   return;
    // }

    try {
      // If we're on the 2FA step, verify the TOTP / backup code instead.
      if (showTwoFactor) {
        const { error: totpError } = await authClient.twoFactor.verifyTotp({
          code: twoFactorCode,
        });

        if (totpError) {
          setError('Invalid 2FA code');
          return;
        }

        routerPush(callbackUrl);
        return;
      }

      const { data, error: signInError } = await authClient.signIn.email({
        email,
        password,
        callbackURL: callbackUrl,
      });

      if (signInError) {
        // Email not verified — surface the resend option instead of failing silently.
        if (signInError.status === 403 || signInError.code === 'EMAIL_NOT_VERIFIED') {
          setUnverifiedEmail(email);
          setError('Email is not verified. Please verify your email to log in.');
          return;
        }

        setError('Invalid email or password');
        return;
      }

      // Account has 2FA enabled — switch to the verification step.
      if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
        setShowTwoFactor(true);
        setError('');
        return;
      }

      routerPush(callbackUrl);
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    void authClient.signIn.social({ provider: 'google', callbackURL: callbackUrl });
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingOtp(true);
    setError('');
    setSuccessMessage('');

    // TEMPORARILY DISABLED CAPTCHA
    // if (!recaptchaToken && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) {
    //   setError('Please complete the reCAPTCHA challenge.');
    //   setIsSendingOtp(false);
    //   return;
    // }

    try {
      const { error: otpError } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: 'sign-in',
      });

      if (otpError) throw new Error(otpError.message || 'Failed to send OTP');

      setOtpStep(2);
      setSuccessMessage('A 6-digit code has been sent to your email.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred while sending OTP.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { error: verifyError } = await authClient.signIn.emailOtp({
        email,
        otp: otpCode,
      });

      if (verifyError) {
        setError(verifyError.message || 'Invalid code');
      } else {
        routerPush(callbackUrl);
      }
    } catch {
      setError('An error occurred while verifying the code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLink = async () => {
    setIsLoading(true);
    setError('');

    try {
      const { error: linkError } = await authClient.signIn.magicLink({
        email,
        callbackURL: callbackUrl,
      });

      if (linkError) {
        setError(linkError.message || 'Failed to send magic link');
      } else {
        setError('');
        alert('Check your email for a magic link!');
      }
    } catch {
      setError('Failed to send magic link');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="flex flex-col space-y-2 text-center">
        <h2 className="text-3xl font-bold tracking-tight">Welcome back</h2>
        <p className="text-sm text-muted-foreground">
          Enter your email to sign in to your account
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

        {!showOtpFlow && !showTwoFactor && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => { setShowOtpFlow(true); setError(''); setSuccessMessage(''); }}
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
              Or continue with password
            </span>
          </div>
        </div>

        {/* OTP Form */}
        {showOtpFlow && !showTwoFactor && (
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

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={isSendingOtp}>
                {isSendingOtp ? 'Sending Code...' : 'Send Login Code'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setShowOtpFlow(false)}>
                Back to Password Login
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

              {successMessage && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
                  {successMessage}
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}

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
        )}

        {/* Email/Password Form */}
        {!showOtpFlow && (
          !showTwoFactor ? (
            <form onSubmit={handleEmailSignIn} className="space-y-4">
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
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                    Forgot password?
                  </Link>
                </div>
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
              </div>

              {successMessage && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
                  {successMessage}
                </div>
              )}

              {error && (
                <div className="space-y-2">
                  <p className="text-sm text-destructive">{error}</p>
                  {unverifiedEmail && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full text-xs"
                      onClick={handleResendVerification}
                      disabled={isResending}
                    >
                      {isResending ? 'Sending...' : 'Resend Verification Email'}
                    </Button>
                  )}
                </div>
              )}

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

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? 'Signing in...' : 'Sign In with Email & Password'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleEmailSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Two-Factor Authentication Code</Label>
                <Input
                  id="code"
                  placeholder="000000"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  required
                  className="text-center text-lg tracking-widest"
                  maxLength={6}
                  disabled={isLoading}
                  autoFocus
                  autoComplete="one-time-code"
                />
                <p className="text-xs text-muted-foreground text-center">
                  Enter the code from your authenticator app.
                </p>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Verifying...' : 'Verify'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setShowTwoFactor(false)}>
                Back to Login
              </Button>
            </form>
          ))}

        {/* Magic Link - only if email provider configured */}
        {process.env.NEXT_PUBLIC_EMAIL_PROVIDER_ENABLED === 'true' && (
          <Button
            variant="link"
            className="w-full"
            onClick={handleMagicLink}
            disabled={isLoading || !email}
          >
            Send me a magic link instead
          </Button>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-primary font-semibold hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background p-4"><Loader2 className="size-8 animate-spin text-primary" /></div>}>
      <LoginContent />
    </Suspense>
  );
}
