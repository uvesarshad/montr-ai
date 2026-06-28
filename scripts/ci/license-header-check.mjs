// SPDX-License-Identifier: SEE LICENSE IN LICENSE.md
// MontrAI — fair-code, licensed under the n8n Sustainable Use License (SUL). © Cloud Fold Studio.
/**
 * license-header-check.mjs — HARD CI GATE (master plan §3.6, gate #4).
 *
 * Ensures every NEWLY ADDED source file carries the project's fair-code license
 * header (the SUL banner described in CONTRIBUTING.md §4). The existing tree was
 * authored before the header convention, so this gate is deliberately scoped to
 * files ADDED in the PR — it never retroactively fails the back-catalogue, only
 * new contributions. As new files land with headers, coverage grows organically.
 *
 * ── The accepted header ───────────────────────────────────────────────────────
 * A file passes if, within its first {HEADER_SCAN_LINES} lines, it carries a
 * comment line referencing the project license — either an `SPDX-License-Identifier`
 * line or the words "Sustainable Use License". The canonical banner to copy into a
 * new file (see CANONICAL_HEADER) is:
 *
 *   // SPDX-License-Identifier: SEE LICENSE IN LICENSE.md
 *   // MontrAI — fair-code, licensed under the n8n Sustainable Use License (SUL). © Cloud Fold Studio.
 *
 * A leading `#!shebang`, a `'use client'` / `'use server'` directive, or blank
 * lines before the banner are allowed (the banner may sit above OR just below a
 * directive — both are valid because the scan covers the file head, not line 1).
 *
 * ── Scope ─────────────────────────────────────────────────────────────────────
 * Only ADDED files matching SOURCE_GLOB under SOURCE_ROOTS are checked. Range comes
 * from BASE_SHA/HEAD_SHA env (PR base/head); on a push with no usable base it exits
 * 0. Generated/vendored/declaration files are skipped (SKIP_PATH).
 *
 * Usage:
 *   node scripts/ci/license-header-check.mjs
 *   BASE_SHA=<sha> HEAD_SHA=<sha> node scripts/ci/license-header-check.mjs
 *
 * Exit codes:  0 — all new source files carry the header (or nothing to check).
 *              1 — one or more new source files are missing the header.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

/** The canonical banner contributors copy into a new file. */
export const CANONICAL_HEADER =
  '// SPDX-License-Identifier: SEE LICENSE IN LICENSE.md\n' +
  '// MontrAI — fair-code, licensed under the n8n Sustainable Use License (SUL). © Cloud Fold Studio.';

/** Roots whose new source files require the header. */
export const SOURCE_ROOTS = ['src/'];

/** Source file extensions subject to the header requirement. */
const SOURCE_GLOB = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/** Paths exempt from the header (generated, vendored, declaration, or config). */
const SKIP_PATH = /(^|\/)(node_modules|\.next|dist|temp)\/|\.d\.ts$|next-env\.d\.ts$/;

/** How many lines from the file head we scan for the banner. */
export const HEADER_SCAN_LINES = 12;

/** A line that satisfies the license-header requirement. */
const HEADER_MARKER = /SPDX-License-Identifier|Sustainable Use License/;

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────────

/** Is this path a source file we require a header on? */
export function isSourceFile(p) {
  const norm = p.replace(/\\/g, '/');
  if (SKIP_PATH.test(norm)) return false;
  if (!SOURCE_GLOB.test(norm)) return false;
  return SOURCE_ROOTS.some((r) => norm.startsWith(r));
}

/** Does the file content carry the license header within its head region? */
export function hasLicenseHeader(content) {
  const head = content.split('\n').slice(0, HEADER_SCAN_LINES).join('\n');
  return HEADER_MARKER.test(head);
}

// ── Git plumbing + entrypoint ──────────────────────────────────────────────────

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

/** Repo-relative POSIX paths ADDED in the range (status A or rename-target). */
export function parseAddedFiles(nameStatusText) {
  const out = [];
  for (const raw of nameStatusText.split('\n')) {
    const line = raw.trimEnd();
    if (!line) continue;
    const parts = line.split('\t');
    const code = parts[0][0];
    if (code === 'A') out.push(parts[1].replace(/\\/g, '/'));
    else if (code === 'R' || code === 'C') out.push(parts[2].replace(/\\/g, '/'));
  }
  return out;
}

function resolveRange() {
  const zeros = (s) => !s || /^0+$/.test(s);
  const base = (process.env.BASE_SHA || '').trim();
  const head = (process.env.HEAD_SHA || '').trim() || 'HEAD';
  if (!zeros(base)) {
    try {
      git(['cat-file', '-e', `${base}^{commit}`]);
      return { base, head };
    } catch {
      /* shallow — fall through */
    }
  }
  try {
    const parent = git(['rev-parse', 'HEAD^']).trim();
    return { base: parent, head: 'HEAD' };
  } catch {
    return null;
  }
}

function main() {
  const range = resolveRange();
  if (!range) {
    console.log('license-header check: no comparable base commit — nothing to check (OK).');
    return 0;
  }
  const { base, head } = range;
  const added = parseAddedFiles(git(['diff', '--no-color', '--name-status', '-M', base, head])).filter(
    isSourceFile,
  );

  const missing = [];
  for (const file of added) {
    let content = '';
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue; // deleted-after-add or unreadable — skip.
    }
    if (!hasLicenseHeader(content)) missing.push(file);
  }

  console.log('license-header check — new source files');
  console.log(`  new source files ...... ${added.length}`);
  console.log(`  missing header ........ ${missing.length}`);

  if (missing.length === 0) {
    console.log('License-header check passed — every new source file carries the SUL banner.');
    return 0;
  }

  console.error('\n::error::License-header check FAILED — new source files are missing the SUL banner.');
  for (const f of missing) {
    console.error(`::error file=${f}::missing license header`);
    console.error(`  ✗ ${f}`);
  }
  console.error('\nAdd this banner to the top of each file (above or below any directive):\n');
  console.error(CANONICAL_HEADER.split('\n').map((l) => `    ${l}`).join('\n'));
  console.error('\nSee CONTRIBUTING.md §4 and docs/MAINTAINER-AGENT.md.');
  return 1;
}

const invokedDirectly =
  process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/ci/license-header-check.mjs');
if (invokedDirectly) {
  process.exitCode = main();
}
