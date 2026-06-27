import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

// BetterAuth mounts all of its endpoints under /api/auth/* (sign-in, sign-up,
// callbacks, two-factor, email-otp, magic-link, reset/verify, etc).
export const { GET, POST } = toNextJsHandler(auth);
