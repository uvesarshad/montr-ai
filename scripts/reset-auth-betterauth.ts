/**
 * Greenfield auth reset for the NextAuth -> BetterAuth migration (decision D3).
 *
 * ⚠️ DESTRUCTIVE — guarded by RESET_AUTH_CONFIRM=yes. Back up the DB first.
 *
 * What it does:
 *  1. Drops the auth collections BetterAuth manages plus legacy NextAuth/custom
 *     collections (sessions/accounts/verifications/twoFactor/otps/...).
 *  2. Strips per-user auth fields from `users` (hashedPassword, 2FA secrets,
 *     reset tokens, embedded accounts[], emailVerified) — domain data on the
 *     user docs is preserved, so everyone simply re-authenticates once.
 *  3. Reseeds the super-admin by POSTing to the RUNNING app's BetterAuth
 *     sign-up endpoint (so the scrypt hash + `accounts` row are created the way
 *     BetterAuth expects), then patches that user to emailVerified:true +
 *     role:super_admin.
 *
 * It deliberately does NOT import '@/lib/auth' — that pulls
 * better-auth/next-js -> next/headers, which crashes outside the Next runtime
 * (same class of gotcha as the workflow worker). Hashing is therefore delegated
 * to the live HTTP endpoint instead of being reproduced here.
 *
 * Usage (the dev server must be running for the reseed step):
 *   RESET_AUTH_CONFIRM=yes BASE_URL=http://localhost:9002 \
 *   SUPER_ADMIN_EMAIL=superuves@gmail.com SUPER_ADMIN_PASSWORD='a-strong-pass' \
 *   npx tsx scripts/reset-auth-betterauth.ts
 */
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/montrai';
const dbName = process.env.MONGODB_DB_NAME || 'montrai';
const baseUrl = process.env.BASE_URL || 'http://localhost:9002';

// BetterAuth-managed (per the modelName mapping in src/lib/auth.ts) + legacy
// NextAuth/custom collections to clear for a clean greenfield start.
const COLLECTIONS_TO_DROP = [
    'sessions',
    'accounts',
    'verifications',
    'twoFactor',
    'twoFactors',
    'otps',
    'emailVerificationTokens',
    'verificationTokens', // legacy NextAuth adapter
];

const USER_AUTH_FIELDS_TO_UNSET = {
    hashedPassword: '',
    twoFactorSecret: '',
    twoFactorBackupCodes: '',
    twoFactorEnabled: '',
    resetToken: '',
    resetTokenExpiry: '',
    accounts: '',
    emailVerified: '',
} as const;

async function main() {
    if (process.env.RESET_AUTH_CONFIRM !== 'yes') {
        console.error('Refusing to run. This is DESTRUCTIVE. Re-run with RESET_AUTH_CONFIRM=yes.');
        process.exit(1);
    }

    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(dbName);
    console.log(`Connected to ${dbName}.`);

    // 1) Drop auth collections.
    for (const name of COLLECTIONS_TO_DROP) {
        try {
            await db.collection(name).drop();
            console.log(`  dropped ${name}`);
        } catch (e) {
            const err = e as { codeName?: string; message?: string };
            if (err.codeName !== 'NamespaceNotFound') {
                console.warn(`  skip ${name}: ${err.message}`);
            }
        }
    }

    // 2) Strip per-user auth fields (keep domain data + the user docs).
    const stripped = await db
        .collection('users')
        .updateMany({}, { $unset: USER_AUTH_FIELDS_TO_UNSET });
    console.log(`  stripped auth fields from ${stripped.modifiedCount} user(s)`);

    // 3) Reseed the super-admin via the live BetterAuth sign-up endpoint.
    const email = (process.env.SUPER_ADMIN_EMAIL || 'superuves@gmail.com').toLowerCase();
    const password = process.env.SUPER_ADMIN_PASSWORD;
    if (!password || password.length < 12) {
        console.error('Set SUPER_ADMIN_PASSWORD (>= 12 chars) to reseed the super-admin.');
        await client.close();
        process.exit(1);
    }

    // Remove any leftover doc so the sign-up is clean.
    await db.collection('users').deleteOne({ email });

    const res = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
        method: 'POST',
        // BetterAuth enforces an Origin matching `trustedOrigins` on mutations.
        headers: { 'content-type': 'application/json', origin: baseUrl },
        body: JSON.stringify({ email, password, name: 'Super Admin' }),
    });
    if (!res.ok) {
        const body = await res.text();
        console.error(`Sign-up failed (${res.status}): ${body}`);
        console.error(`Is the dev server running at ${baseUrl}?`);
        await client.close();
        process.exit(1);
    }

    // 4) Elevate + mark verified.
    await db
        .collection('users')
        .updateOne({ email }, { $set: { role: 'super_admin', emailVerified: true } });
    console.log(`✅ super-admin reseeded + elevated: ${email}`);

    await client.close();
    console.log('Done.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
