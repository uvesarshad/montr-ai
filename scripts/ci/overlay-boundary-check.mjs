// SPDX-License-Identifier: SEE LICENSE IN LICENSE.md
// MontrAI — fair-code, licensed under the n8n Sustainable Use License (SUL). © Cloud Fold Studio.
/**
 * overlay-boundary-check.mjs — HARD CI GATE (master plan §3.6, gate #2).
 *
 * Fails any PR that ADDS a file under a commercial/overlay path, or that ADDS an
 * import reaching into an overlay-only surface. This keeps closed commercial code
 * (billing, the Connections-Gateway broker, white-label, SSO/advanced-RBAC,
 * managed-AI, the super-admin cloud control plane) from ever leaking into the
 * public single-tenant core, and keeps the core overlay-AGNOSTIC.
 *
 * ── Source of truth for the forbidden set ────────────────────────────────────
 * The forbidden PATH list below is a hand-kept MIRROR of the carve delete-manifest
 * (`scripts/oss-generate/carve/delete-manifest.ts`, the founder-chosen DELETE-in-core
 * set) plus the broader overlay surfaces named in CONTRIBUTING.md §2 / master plan
 * §3.6. We do NOT `import` delete-manifest.ts here on purpose: the emit pipeline
 * SCRUBS `scripts/oss-generate/**` out of the public tree, so this gate — which
 * ships to and runs in the PUBLIC repo — must be self-contained. If you change the
 * delete-manifest, mirror the change here (and vice-versa). The drift test in
 * `scripts/ci/__tests__/ci-gates.test.ts` (run privately) cross-checks the two.
 *
 * ── Scope ─────────────────────────────────────────────────────────────────────
 * Operates on the PR diff only (ADDED / renamed files for the path check; ADDED
 * lines of any changed file for the import check) so it is a no-op for the existing
 * tree and only ever fails on a NEW boundary violation. Range comes from
 * BASE_SHA/HEAD_SHA env (the workflow passes the PR base/head); on a push with no
 * usable base it exits 0 (nothing to diff).
 *
 * Usage:
 *   node scripts/ci/overlay-boundary-check.mjs
 *   BASE_SHA=<sha> HEAD_SHA=<sha> node scripts/ci/overlay-boundary-check.mjs
 *
 * Exit codes:  0 — clean (or nothing to diff).   1 — boundary violation found.
 */

import { execFileSync } from 'node:child_process';

// ── Forbidden PATH set (mirror of the carve delete-manifest + plan §3.6) ───────

/**
 * Whole trees: ANY path under one of these prefixes is commercial/overlay and may
 * never appear in the public core. Derived from delete-manifest §1A/§1B/§1D.
 */
export const FORBIDDEN_DIR_PREFIXES = [
  'src/app/(admin)/', //                       §1A super-admin portal UI
  'src/app/api/v2/admin/', //                  §1A super-admin control-plane API
  'src/app/api/v2/razorpay/', //               §1B Razorpay billing API
  'src/app/api/social/white-label/', //        §1D white-label social API
  'src/app/(app)/social/settings/white-label/', // §1D white-label tenant UI
  'src/app/pricing/', //                       §1B cloud pricing page
];

/**
 * Exact leaf files (the rest of the delete-manifest). NOTE: the white-label MODEL
 * (`white-label-profile.model.ts`) and `report-branding-header.tsx` are KEPT in
 * core as always-null stubs (delete-manifest STUB_TODO) — do NOT add them here.
 */
export const FORBIDDEN_EXACT_FILES = new Set([
  'src/lib/social/white-label.ts', //                              §1D
  'src/lib/db/repository/white-label-profile.repository.ts', //    §1D
  'src/lib/auth/with-auth.ts', //                                  §0.4 dead code
]);

/**
 * Generic reserved overlay markers — forward-proofing for future commercial
 * surfaces (the Connections-Gateway broker, an `overlay/`/`ee/` package, etc.)
 * that the master plan keeps private. Any path segment named `overlay` or `ee`.
 */
export const FORBIDDEN_PATH_REGEXES = [
  /(^|\/)overlay\//i,
  /(^|\/)ee\//i,
];

// ── Forbidden IMPORT specifiers (core must stay overlay-agnostic) ──────────────

/**
 * Module specifiers a public-core file must never import. Tested against each
 * ADDED diff line. The `(?!-)` after white-label excludes the kept model path
 * `@/lib/db/models/white-label-profile.model` and `report-branding-header`.
 */
export const FORBIDDEN_IMPORT_REGEXES = [
  /@overlay\//,
  /(\.{1,2}\/)+overlay\//, //                          relative ../overlay/
  /['"`(]overlay\//, //                                bare overlay/ specifier
  /['"`(]ee\//, //                                     bare ee/ specifier
  /@\/app\/\(admin\)/,
  /@\/app\/api\/v2\/admin/,
  /@\/app\/api\/v2\/razorpay/,
  /@\/app\/api\/social\/white-label/,
  /@\/lib\/social\/white-label(?!-)/, //               white-label.ts (not the kept model)
  /@\/lib\/db\/repository\/white-label-profile\.repository/,
  /@\/lib\/auth\/with-auth/,
];

/** Source extensions whose ADDED lines we scan for forbidden imports. */
const IMPORT_SCAN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────────

/**
 * Classify a repo-relative POSIX path. Returns a human reason if the path is an
 * overlay/commercial surface that may not enter the public core, else null.
 */
export function classifyPath(p) {
  const norm = p.replace(/\\/g, '/');
  if (FORBIDDEN_EXACT_FILES.has(norm)) {
    return `exact overlay leaf "${norm}" (carve delete-manifest)`;
  }
  for (const prefix of FORBIDDEN_DIR_PREFIXES) {
    if (norm.startsWith(prefix)) return `under forbidden overlay tree "${prefix}"`;
  }
  for (const re of FORBIDDEN_PATH_REGEXES) {
    if (re.test(norm)) return `matches reserved overlay marker ${re}`;
  }
  return null;
}

/**
 * Scan a single (added) source line for a forbidden overlay import specifier.
 * Returns the matched marker string, or null. Only meaningful for import-ish
 * lines, but tested broadly — the specifiers are specific enough to not collide.
 */
export function scanLineForForbiddenImport(line) {
  if (!/\b(import|export|require|from)\b|import\s*\(/.test(line)) return null;
  for (const re of FORBIDDEN_IMPORT_REGEXES) {
    if (re.test(line)) return String(re);
  }
  return null;
}

/**
 * Parse `git diff --name-status -M` output into [{ status, path }].
 * For renames/copies (R###/C###) the NEW path (the second column) is used.
 */
export function parseNameStatus(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (!line) continue;
    const parts = line.split('\t');
    const status = parts[0];
    const code = status[0];
    const path = code === 'R' || code === 'C' ? parts[2] : parts[1];
    if (!path) continue;
    out.push({ status: code, path: path.replace(/\\/g, '/') });
  }
  return out;
}

/**
 * Parse a `git diff --unified=0` body into a Map<path, addedLines[]>, where
 * addedLines are the new-side content lines (without the leading '+').
 */
export function parseAddedLines(text) {
  const byFile = new Map();
  let current = null;
  for (const raw of text.split('\n')) {
    if (raw.startsWith('+++ ')) {
      // "+++ b/<path>" or "+++ /dev/null"
      const m = raw.slice(4).trim();
      if (m === '/dev/null') {
        current = null;
      } else {
        current = m.replace(/^b\//, '').replace(/\\/g, '/');
        if (!byFile.has(current)) byFile.set(current, []);
      }
      continue;
    }
    if (raw.startsWith('+') && !raw.startsWith('+++') && current) {
      byFile.get(current).push(raw.slice(1));
    }
  }
  return byFile;
}

/**
 * Evaluate parsed diff inputs into a list of violations. Pure — no git/process.
 *   nameStatus  : output of parseNameStatus()
 *   addedLines  : output of parseAddedLines()
 */
export function evaluate(nameStatus, addedLines) {
  const violations = [];

  // (1) PATH check — new/renamed/copied files at a forbidden path.
  for (const { status, path } of nameStatus) {
    if (status !== 'A' && status !== 'R' && status !== 'C') continue;
    const reason = classifyPath(path);
    if (reason) violations.push({ kind: 'path', file: path, detail: reason });
  }

  // (2) IMPORT check — added lines of any changed source file.
  for (const [file, lines] of addedLines) {
    if (!IMPORT_SCAN_EXT.test(file)) continue;
    lines.forEach((line, i) => {
      const marker = scanLineForForbiddenImport(line);
      if (marker) {
        violations.push({
          kind: 'import',
          file,
          detail: `added line imports overlay surface (${marker}): ${line.trim().slice(0, 120)}`,
        });
      }
    });
  }
  return violations;
}

// ── Git plumbing + entrypoint ──────────────────────────────────────────────────

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

/** Resolve the (base, head) commit range from env, with a push fallback. */
function resolveRange() {
  const zeros = (s) => !s || /^0+$/.test(s);
  const base = (process.env.BASE_SHA || '').trim();
  const head = (process.env.HEAD_SHA || '').trim() || 'HEAD';
  if (!zeros(base)) {
    try {
      git(['cat-file', '-e', `${base}^{commit}`]);
      return { base, head };
    } catch {
      // base not in local history (shallow checkout) — fall through.
    }
  }
  // Push fallback: diff the tip against its first parent if one exists.
  try {
    const parent = git(['rev-parse', 'HEAD^']).trim();
    return { base: parent, head: 'HEAD' };
  } catch {
    return null; // root commit / nothing to compare — no-op.
  }
}

function main() {
  const range = resolveRange();
  if (!range) {
    console.log('overlay-boundary guard: no comparable base commit — nothing to check (OK).');
    return 0;
  }
  const { base, head } = range;
  const nameStatus = parseNameStatus(git(['diff', '--no-color', '--name-status', '-M', base, head]));
  const addedLines = parseAddedLines(
    git(['diff', '--no-color', '--unified=0', '-M', base, head]),
  );

  const violations = evaluate(nameStatus, addedLines);

  console.log(`overlay-boundary guard — range ${base.slice(0, 12)}..${typeof head === 'string' && head.length > 12 ? head.slice(0, 12) : head}`);
  console.log(`  files in diff ......... ${nameStatus.length}`);
  console.log(`  violations ............ ${violations.length}`);

  if (violations.length === 0) {
    console.log('Overlay-boundary guard passed — public core stays overlay-free.');
    return 0;
  }

  console.error('\n::error::Overlay-boundary guard FAILED — commercial/overlay surface in the public core.');
  for (const v of violations) {
    console.error(`::error file=${v.file}::[${v.kind}] ${v.file} — ${v.detail}`);
    console.error(`  ✗ [${v.kind}] ${v.file}\n      ${v.detail}`);
  }
  console.error(
    '\nThese surfaces belong in the private commercial overlay, not the public core.\n' +
      'See CONTRIBUTING.md §2 and docs/MAINTAINER-AGENT.md. If this is a false positive,\n' +
      'the forbidden set lives in scripts/ci/overlay-boundary-check.mjs.',
  );
  return 1;
}

// Only run when invoked directly (not when imported by the test).
const invokedDirectly =
  process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/ci/overlay-boundary-check.mjs');
if (invokedDirectly) {
  process.exitCode = main();
}
