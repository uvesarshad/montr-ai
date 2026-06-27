/**
 * BetterAuth server instance — the single source of truth for authentication.
 *
 * Replaces the NextAuth v5 setup (root `auth.ts`). Session model is DB-backed
 * (revocable) with a short-lived signed cookie cache so hot paths skip the DB
 * read — mirroring the old 60s in-process JWT role cache while gaining
 * server-side revocation.
 *
 * NOTE: this module pulls in Mongoose / credit-service / Brevo and is therefore
 * Node-only. It MUST NOT be imported from `middleware.ts` (Edge runtime) — the
 * middleware uses `better-auth/cookies` helpers instead.
 */
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { nextCookies } from 'better-auth/next-js';
import { twoFactor, emailOTP, magicLink, customSession } from 'better-auth/plugins';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { MongoClient, ObjectId } from 'mongodb';
import { isSuperAdminEmail } from '@/lib/auth/super-admin';
import {
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendMagicLinkEmail,
    sendOtpEmail,
} from '@/lib/brevo';
import { checkRateLimitGeneric, getClientIp } from '@/lib/rate-limiter';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/montrai';
const dbName = process.env.MONGODB_DB_NAME || 'montrai';

// Dedicated MongoClient for the auth adapter. Constructed synchronously (the
// driver connects lazily on first op) to avoid top-level await, and cached on
// globalThis in dev so HMR module reloads don't leak connection pools.
const globalForMongo = globalThis as unknown as { _betterAuthMongoClient?: MongoClient };
const mongoClient = globalForMongo._betterAuthMongoClient ?? new MongoClient(uri);
if (process.env.NODE_ENV !== 'production') globalForMongo._betterAuthMongoClient = mongoClient;
const db = mongoClient.db(dbName);

const appUrl =
    process.env.BETTER_AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:9002';

const googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

// Send transactional auth emails without ever failing the underlying auth
// operation. Matches the old custom routes ("don't block signup if email
// sending fails") and keeps sign-up/reset/OTP working when the mail provider
// (Brevo) isn't configured — the token/account is still created.
async function safeSendEmail(label: string, fn: () => Promise<unknown>): Promise<void> {
    try {
        await fn();
    } catch (e) {
        console.error(`[auth] ${label} email failed:`, e instanceof Error ? e.message : e);
    }
}

// Fail-closed rate-limit map keyed by BetterAuth endpoint prefix. Mirrors the
// limits the old NextAuth credentials provider + custom /api/auth/* routes
// enforced. BetterAuth's built-in limiter fails OPEN, so brute-force-sensitive
// surfaces are guarded here with `failMode: 'closed'` instead.
type RlPolicy = { bucket: string; limit: number; windowSeconds: number };
function rlPolicyFor(path: string): RlPolicy | null {
    if (path.includes('magic-link') || path.startsWith('/sign-in'))
        return { bucket: 'auth:login', limit: 10, windowSeconds: 15 * 60 };
    if (path.startsWith('/sign-up'))
        return { bucket: 'auth:signup', limit: 5, windowSeconds: 60 * 60 };
    if (path.includes('send-verification-otp') || path.includes('send-otp'))
        return { bucket: 'auth:send-otp', limit: 3, windowSeconds: 5 * 60 };
    if (path.includes('forget-password') || path.includes('request-password-reset'))
        return { bucket: 'auth:forgot-password', limit: 5, windowSeconds: 15 * 60 };
    if (path.includes('reset-password'))
        return { bucket: 'auth:reset-password', limit: 10, windowSeconds: 15 * 60 };
    return null;
}

export const auth = betterAuth({
    appName: 'MontrAI',
    baseURL: appUrl,
    secret:
        process.env.BETTER_AUTH_SECRET ||
        process.env.AUTH_SECRET ||
        process.env.NEXTAUTH_SECRET,
    trustedOrigins: [appUrl],

    // NOTE: no `{ client }` option — passing it makes the adapter wrap writes in
    // MongoDB transactions, which require a replica set. Local/standalone Mongo
    // rejects them (code 20). Omitting it keeps sign-up working on standalone
    // dev Mongo; Atlas (a replica set) works either way.
    database: mongodbAdapter(db),

    // Map BetterAuth's models onto the app's existing collection names so the
    // Mongoose data layer and BetterAuth share one `users` collection.
    user: {
        modelName: 'users',
        additionalFields: {
            role: { type: 'string', required: false, defaultValue: 'user', input: false },
            firebaseUid: { type: 'string', required: false, input: false },
        },
    },
    session: {
        modelName: 'sessions',
        expiresIn: 60 * 60 * 24 * 30, // 30 days
        updateAge: 60 * 60 * 24, // refresh once per day
        cookieCache: { enabled: true, maxAge: 60 }, // ~ old 60s jwtUserCache TTL
    },
    account: {
        modelName: 'accounts',
        accountLinking: { enabled: true, trustedProviders: ['google'] },
    },
    verification: { modelName: 'verifications' },

    emailAndPassword: {
        enabled: true,
        minPasswordLength: 12,
        requireEmailVerification: true,
        sendResetPassword: async ({ user, token }) => {
            await safeSendEmail('reset-password', () => sendPasswordResetEmail(user.email, token));
        },
    },
    emailVerification: {
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, token }) => {
            await safeSendEmail('verify-email', () => sendVerificationEmail(user.email, token));
        },
    },

    socialProviders: googleEnabled
        ? {
              google: {
                  clientId: process.env.GOOGLE_CLIENT_ID as string,
                  clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
                  // Refuse Google sign-in when Google hasn't verified the address
                  // — preserves the old anti-account-takeover guard on the
                  // dangerous email-linking path.
                  mapProfileToUser: (profile) => {
                      const v = (profile as { email_verified?: boolean | string | number })
                          .email_verified;
                      const verified = v === true || v === 'true' || v === 1 || v === '1';
                      if (!verified) {
                          throw new APIError('FORBIDDEN', {
                              message: 'Google email is not verified',
                          });
                      }
                      return { email: profile.email, name: profile.name, image: profile.picture };
                  },
              },
          }
        : {},

    // Replaces the NextAuth signIn callback (super-admin role + free credits).
    databaseHooks: {
        user: {
            create: {
                before: async (user) => {
                    const role = isSuperAdminEmail(user.email)
                        ? 'super_admin'
                        : (user as { role?: string }).role || 'user';
                    return { data: { ...user, role } };
                },
                after: async (user) => {
                    try {
                        // BetterAuth hooks run on the raw driver; Mongoose isn't
                        // guaranteed connected here, so connect before using any
                        // Mongoose model (else `plans.findOne()` buffer-times-out).
                        const { connectMongoose } = await import('@/lib/mongodb');
                        await connectMongoose();
                        const { allocateCredits } = await import('@/lib/credit-service');
                        const Plan = (await import('@/lib/db/models/plan.model')).default;
                        const freePlan = await Plan.findOne({ name: 'free' });
                        if (!freePlan) {
                            console.error('⚠️ Free plan not found, skipping credit allocation');
                            return;
                        }
                        await db
                            .collection('users')
                            .updateOne(
                                { _id: new ObjectId(user.id) },
                                { $set: { planId: freePlan._id.toString() } },
                            );
                        const periodEnd = new Date();
                        periodEnd.setMonth(periodEnd.getMonth() + 1);
                        await allocateCredits(user.id, freePlan.features.monthlyCredits, periodEnd);
                        console.log(`✅ Allocated free credits to new user ${user.id}`);
                    } catch (e) {
                        console.error('❌ Initial credit allocation failed:', e);
                    }
                },
            },
        },
    },

    // Fail-closed rate limiting on brute-force-sensitive endpoints.
    hooks: {
        before: createAuthMiddleware(async (ctx) => {
            const policy = rlPolicyFor(ctx.path);
            if (!policy) return;
            const ip = getClientIp(ctx.headers ?? new Headers());
            const email = (ctx.body as { email?: string } | undefined)?.email;
            const checks = [
                checkRateLimitGeneric({
                    bucket: `${policy.bucket}:ip`,
                    identifier: ip,
                    limit: policy.limit,
                    windowSeconds: policy.windowSeconds,
                    failMode: 'closed',
                }),
            ];
            if (email) {
                checks.push(
                    checkRateLimitGeneric({
                        bucket: `${policy.bucket}:target`,
                        identifier: email.toLowerCase(),
                        limit: policy.limit,
                        windowSeconds: policy.windowSeconds,
                        failMode: 'closed',
                    }),
                );
            }
            const results = await Promise.all(checks);
            if (results.some((r) => !r.allowed)) {
                throw new APIError('TOO_MANY_REQUESTS', {
                    message: 'Too many attempts. Please try again later.',
                });
            }
        }),
    },

    plugins: [
        twoFactor({
            issuer: 'MontrAI',
            totpOptions: { digits: 6, period: 30 },
            backupCodeOptions: { amount: 10, length: 10 },
            otpOptions: {
                async sendOTP({ user, otp }) {
                    await safeSendEmail('2fa-otp', () => sendOtpEmail(user.email, otp));
                },
            },
        }),
        emailOTP({
            async sendVerificationOTP({ email, otp }) {
                await safeSendEmail('email-otp', () => sendOtpEmail(email, otp));
            },
        }),
        magicLink({
            async sendMagicLink({ email, url }) {
                await safeSendEmail('magic-link', () => sendMagicLinkEmail(email, url));
            },
        }),
        // Guarantee role/organizationId/firebaseUid on every resolved session and
        // re-apply super-admin elevation by email (defends against stored-role
        // drift and cookie-cache additionalField gaps). The additionalFields are
        // present at runtime but absent from customSession's inferred `user`
        // param type, so we read them through a cast and return them explicitly
        // — that puts them back on the inferred session type the whole app uses.
        customSession(async ({ user, session }) => {
            const u = user as typeof user & {
                role?: string;
                firebaseUid?: string;
            };
            const role = isSuperAdminEmail(u.email) ? 'super_admin' : u.role;
            return {
                session,
                user: {
                    ...u,
                    role,
                    firebaseUid: u.firebaseUid,
                },
            };
        }),
        nextCookies(), // MUST be last
    ],
});

export type Session = typeof auth.$Infer.Session;
