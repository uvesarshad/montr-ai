import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Integration test config — SEPARATE from `vitest.config.ts`.
 *
 * Unlike the pure-unit suite (`npm run test`, NO DB/Redis), this suite stands up
 * REAL Mongo (single-node replica set rs0 — transactions need it), Postgres
 * (pgvector) and Redis via testcontainers, then runs repository + API-route
 * tests against them. It is intentionally NOT picked up by `npm run test`:
 *
 *   - the default config's `include` is `src/**`, so `tests/integration/**`
 *     never matches there;
 *   - this file is only loaded via `npm run test:integration` (which passes
 *     `--config vitest.integration.config.ts`).
 *
 * Containers are started once in `tests/integration/global-setup.ts` and the
 * connection strings handed to workers via a temp env file that the per-worker
 * `tests/integration/setup.ts` loads into `process.env` BEFORE any DB module is
 * imported (the Mongo/PG clients read their URIs lazily, so this ordering holds).
 *
 * Prereqs (heavy dev deps — install once):
 *   npm i -D testcontainers @testcontainers/mongodb @testcontainers/postgresql @testcontainers/redis
 * and a running Docker daemon.
 */
export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/integration/**/*.{test,spec}.{ts,tsx}'],
        exclude: ['node_modules', '.next', 'dist', 'temp'],
        globals: false,
        // Container boot + image pulls are slow; give global setup and each
        // test plenty of head-room.
        globalSetup: ['tests/integration/global-setup.ts'],
        setupFiles: ['tests/integration/setup.ts'],
        hookTimeout: 180_000,
        testTimeout: 60_000,
        teardownTimeout: 60_000,
        // One shared process so the single Mongo/PG/Redis connection is reused
        // and tests run sequentially against the same containers (no cross-test
        // DB races).
        pool: 'forks',
        poolOptions: {
            forks: { singleFork: true },
        },
        fileParallelism: false,
        sequence: { concurrent: false },
    },
    resolve: {
        // Mirror the unit config: '@/*' maps to BOTH './src/*' and the repo root
        // (e.g. '@/auth' → ./auth.ts). Root-level modules get explicit entries
        // ahead of the general './src' mapping.
        alias: [
            { find: '@/auth', replacement: path.resolve(__dirname, './auth.ts') },
            { find: '@', replacement: path.resolve(__dirname, './src') },
        ],
    },
});
