/**
 * vitest.config.ts (scripts/ci) — runs the CI hard-gate unit tests. The repo-root
 * vitest config scopes `include` to `src/**`, so these tests (under `scripts/ci/**`)
 * need a dedicated config, mirroring scripts/oss-generate/vitest.config.ts.
 *
 * Run:  npx vitest run --config scripts/ci/vitest.config.ts
 */

import { defineConfig } from 'vitest/config';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..', '..');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/ci/**/*.{test,spec}.{ts,mts}'],
    exclude: ['node_modules', '.next', 'dist', 'temp'],
    globals: false,
    root: repoRoot,
  },
});
