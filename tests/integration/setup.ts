/**
 * Per-worker setup (runs in each test worker BEFORE any test module is
 * evaluated). Loads the container connection strings published by
 * `global-setup.ts` into `process.env`.
 *
 * This ordering is load-bearing: `src/lib/mongodb.ts` captures `MONGODB_URI`
 * into a module-level const, and `src/lib/db/pg-client.ts` reads `DATABASE_URL`
 * lazily. Because those modules are only imported *inside* repository methods
 * (dynamic import / lazy pool), the env is guaranteed to be set here first.
 */
import { readFileSync } from 'node:fs';

import { ENV_FILE_PATH } from './shared';

try {
    const raw = readFileSync(ENV_FILE_PATH, 'utf8');
    const env = JSON.parse(raw) as Record<string, string>;
    for (const [k, v] of Object.entries(env)) {
        process.env[k] = v;
    }
} catch (err) {
    throw new Error(
        `[integration] could not read container env at ${ENV_FILE_PATH}. ` +
            'Did global-setup run? Original error: ' +
            (err instanceof Error ? err.message : String(err)),
    );
}

// Keep DB code on its non-production paths and silence noisy embedding warnings.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
