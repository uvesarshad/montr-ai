# Auth Flow

> Scope: Authentication lifecycle from login to protected resource access.
> Rendering context: Server-side (auth()) + Client-side (useSession)
> Project tier: 4
> Last updated: 2026-05-20

## Overview

MontrAI uses NextAuth v5 (next-auth@5.0.0-beta) with a JWT session strategy. Users can sign in via email/password credentials, Google OAuth, or a magic-link email (Resend provider). Sessions are stored as signed JWTs in HTTP-only cookies, not in the database. An in-process cache in auth.ts reduces MongoDB lookups on every JWT validation to once per 60 seconds per user.

## Providers

- Credentials provider: email + bcrypt-hashed password. Validates reCAPTCHA. Checks rate limit via checkRateLimitGeneric from src/lib/rate-limiter.ts. Supports optional TOTP 2FA (src/lib/auth/2fa.ts).
- Google OAuth: optional, enabled only when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set. Requires email_verified: true on the Google token. allowDangerousEmailAccountLinking is enabled so existing credentials accounts can link to Google.
- Resend provider: magic-link email, used for passwordless login.

AGENT NOTE: The Google provider uses allowDangerousEmailAccountLinking deliberately for account migration. The signIn callback enforces email_verified to prevent account takeover via this path.

## Session Strategy

- strategy: 'jwt' in authConfig.session. No database session table.
- The jwt callback (auth.ts) writes id, role, organizationId, twoFactorEnabled, firebaseUid into the token on first sign-in.
- Subsequent requests: the JWT callback checks an in-process jwtUserCache (Map, 60-second TTL). On cache miss, it re-reads role and organizationId from MongoDB. This means role/org changes propagate within 60 seconds.
- The session callback maps token fields onto session.user for client consumption.
- MongoDBAdapter (auth.ts) is used for the MongoDB sessions collection (used by NextAuth internally for adapters, not for JWT sessions).

## Protected Route Enforcement

middleware.ts runs on every request (matcher: all paths except static assets and images).

1. Requests to paths in publicRoutes[] bypass auth entirely.
2. CSRF check: mutations (POST/PUT/PATCH/DELETE) to /api/* that are not in publicRoutes must pass an Origin or Sec-Fetch-Site: same-origin header. Cross-origin mutations return 403.
3. Auth check: calls auth() (which decodes the JWT). Missing or invalid session returns 401 (API) or redirects to /login (pages).
4. Admin check: requests to /admin, /organizations, /api/admin, /api/v2/admin require role === 'admin' or role === 'super_admin'. Others get 403 (API) or redirect to / (pages).

## Public Routes

Defined in publicRoutes[] in middleware.ts. Key exemptions:
- /api/auth/ — NextAuth's own endpoints
- /api/cron/ — Each route enforces Bearer CRON_SECRET independently
- /api/webhooks/ — Each route verifies provider signature
- /api/v2/razorpay/webhook — Verifies Razorpay HMAC
- /api/v2/inbox/webhook/ — Inbound channel webhooks
- /api/public/ — Public form and document APIs

## App Layout Auth Guard

src/app/(app)/layout.tsx is a Client Component that reads status from useSession. While loading, it shows a spinner. If status is not authenticated, it redirects to /login via router.push. This provides a second layer of protection in addition to middleware.ts.

AGENT NOTE: The layout guard is client-side and has a brief loading state. Do not rely on it alone for security — always verify the session server-side in API route handlers using auth().

## Two-Factor Authentication

src/lib/auth/2fa.ts provides verifyTwoFactorToken (TOTP) and backup code verification. The credentials provider checks twoFactorEnabled on the user record and validates the TOTP code if enabled. The 2FA secret is stored encrypted in the user document.

## Auth Rate Limiting

src/lib/auth/rate-limit.ts defines per-bucket limits (auth:login: 10/15 min, auth:signup: 5/60 min, etc.) using the generic Redis sliding-window rate limiter. Rate limiting fails closed — if Redis is unavailable, auth endpoints return 429 rather than letting unlimited attempts through.

AGENT SEE: docs/auth/authorization.md — role and organization access control

## Update Triggers

Update this file when the auth provider changes, when the session strategy changes, when new public routes are added, or when the 2FA implementation changes.

## Related Docs

- docs/auth/authorization.md — Role-based access control and multi-tenancy
- docs/infra/environment.md — NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, RESEND_API_KEY
