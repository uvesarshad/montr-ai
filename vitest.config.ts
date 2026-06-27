import { defineConfig } from 'vitest/config';
import { transform } from 'esbuild';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * tsconfig.json sets `jsx: "preserve"` (mandatory for Next.js). Under Vite 8 +
 * Vitest 4, esbuild honours that per-file tsconfig setting and leaves JSX
 * un-transformed, so `vite:import-analysis` then fails to parse any `.tsx` a
 * test transitively imports (e.g. `favorite-button.tsx`, pulled in by the CRM
 * column tests) — the documented "favorite-button.tsx:147" transform error.
 *
 * The `esbuild: { jsx, tsconfigRaw }` config option does NOT override this in
 * Vite 8 (the project tsconfig still wins for `.tsx`), so we transform JSX
 * ourselves with an explicit esbuild pass that runs BEFORE import-analysis.
 * This touches the test transform only — never tsconfig or product config.
 */
function jsxTransform(): Plugin {
    return {
        name: 'vitest-jsx-automatic',
        enforce: 'pre',
        async transform(code, id) {
            if (!/\.[jt]sx$/.test(id) || id.includes('node_modules')) return null;
            const result = await transform(code, {
                loader: id.endsWith('.tsx') ? 'tsx' : 'jsx',
                jsx: 'automatic',
                jsxImportSource: 'react',
                sourcefile: id,
                sourcemap: true,
            });
            return { code: result.code, map: result.map };
        },
    };
}

/**
 * Minimal vitest setup for the post-audit baseline test suite.
 *
 * Scope (deliberately narrow for now):
 *   - Pure unit tests of security primitives (SSRF guard, rate-limit helper,
 *     auth helpers, magic-byte sniff, `getClientIp`, `isSafeRedirectUrl`).
 *   - No DB, no Redis, no Next runtime — anything heavier belongs in a
 *     separate integration suite once Mongo/Redis can be containerised in CI.
 *
 * Run with:    npx vitest run
 * Watch with:  npx vitest
 *
 * The package isn't a hard dependency yet — install it dev-side first:
 *   npm i -D vitest @vitest/coverage-v8
 *
 * RESOLVED 2026-06-26 (OSS test-gate, C-prep.0): the 68 `node:test`-style files
 * (top-level `assert`, no describe/it) that made `npm run test` exit red
 * structurally have all been converted to vitest `it()/expect()`. `npm run test`
 * is now a trustworthy CI gate (exit 0 == all assertions pass). Conversion
 * mapping: `test()`→`it()`, `assert.equal`→`toBe`, `assert.deepEqual`→`toEqual`,
 * `assert.ok`→`toBeTruthy`, `assert.match`→`toMatch`, `assert.doesNotMatch`→
 * `not.toMatch`, `assert.throws`→`toThrow`, `assert.doesNotThrow`→`not.toThrow`.
 */
export default defineConfig({
    plugins: [jsxTransform()],
    test: {
        environment: 'node',
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        exclude: ['node_modules', '.next', 'dist', 'temp'],
        // Most security primitives are pure functions, but anything that
        // imports Mongoose touches `__dirname`-style globals; keep the
        // environment Node-flavoured.
        globals: false,
        // The codebase is large — limit watch surface to keep dev fast.
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['src/lib/**/*.ts'],
            exclude: ['src/lib/**/*.{test,spec}.{ts,tsx}', 'src/lib/db/**'],
        },
    },
    resolve: {
        // tsconfig maps '@/*' to BOTH './src/*' and './*' (root fallback —
        // e.g. '@/auth' → ./auth.ts). Vitest aliases can't express fallback
        // candidates, so root-level modules get explicit entries before the
        // general './src' mapping.
        alias: [
            { find: '@/auth', replacement: path.resolve(__dirname, './auth.ts') },
            { find: '@', replacement: path.resolve(__dirname, './src') },
        ],
    },
});
