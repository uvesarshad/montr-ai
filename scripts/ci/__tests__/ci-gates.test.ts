/**
 * ci-gates.test.ts — unit tests for the two hard CI gates (master plan §3.6):
 * the overlay-boundary guard and the license-header check. Pure-logic tests of the
 * exported helpers + a DRIFT test cross-checking the overlay-boundary forbidden set
 * against the real carve delete-manifest (this test runs PRIVATELY, where the
 * manifest exists; the gate itself ships self-contained because emit scrubs it).
 *
 * Run:  npx vitest run --config scripts/ci/vitest.config.ts
 */

import { describe, it, expect } from 'vitest';
import {
  classifyPath,
  scanLineForForbiddenImport,
  parseNameStatus,
  parseAddedLines,
  evaluate,
} from '../overlay-boundary-check.mjs';
import {
  isSourceFile,
  hasLicenseHeader,
  parseAddedFiles,
  CANONICAL_HEADER,
} from '../license-header-check.mjs';
import { deleteManifestPaths, STUB_TODO } from '../../oss-generate/carve/delete-manifest';

describe('overlay-boundary: classifyPath', () => {
  it('flags the super-admin portal UI tree', () => {
    expect(classifyPath('src/app/(admin)/admin/page.tsx')).toBeTruthy();
  });
  it('flags the super-admin control-plane API tree', () => {
    expect(classifyPath('src/app/api/v2/admin/plans/route.ts')).toBeTruthy();
  });
  it('flags the razorpay billing API tree', () => {
    expect(classifyPath('src/app/api/v2/razorpay/webhook/route.ts')).toBeTruthy();
  });
  it('flags the white-label service + repo leaves', () => {
    expect(classifyPath('src/lib/social/white-label.ts')).toBeTruthy();
    expect(classifyPath('src/lib/db/repository/white-label-profile.repository.ts')).toBeTruthy();
  });
  it('flags a reserved overlay/ee directory anywhere', () => {
    expect(classifyPath('packages/overlay/index.ts')).toBeTruthy();
    expect(classifyPath('src/lib/ee/secret.ts')).toBeTruthy();
  });
  it('does NOT flag ordinary core files', () => {
    expect(classifyPath('src/app/(app)/dashboard/page.tsx')).toBeNull();
    expect(classifyPath('src/lib/credit-service.ts')).toBeNull();
  });
  it('does NOT flag the KEPT white-label STUB_TODO files (model + branding header)', () => {
    expect(classifyPath('src/lib/db/models/white-label-profile.model.ts')).toBeNull();
    expect(classifyPath('src/components/social/report-branding-header.tsx')).toBeNull();
  });
});

describe('overlay-boundary: scanLineForForbiddenImport', () => {
  it('flags an @overlay import', () => {
    expect(scanLineForForbiddenImport("import { x } from '@overlay/billing';")).toBeTruthy();
  });
  it('flags a relative ../overlay import', () => {
    expect(scanLineForForbiddenImport("import x from '../../overlay/broker';")).toBeTruthy();
  });
  it('flags importing the admin API or razorpay surface', () => {
    expect(scanLineForForbiddenImport("import { p } from '@/app/api/v2/admin/plans/route';")).toBeTruthy();
    expect(scanLineForForbiddenImport("export { z } from '@/app/api/v2/razorpay/order/route';")).toBeTruthy();
  });
  it('flags the white-label service import but NOT the kept model import', () => {
    expect(scanLineForForbiddenImport("import { wl } from '@/lib/social/white-label';")).toBeTruthy();
    expect(
      scanLineForForbiddenImport("import type { B } from '@/lib/db/models/white-label-profile.model';"),
    ).toBeNull();
  });
  it('ignores non-import lines', () => {
    expect(scanLineForForbiddenImport('const overlay = makeOverlay();')).toBeNull();
  });
});

describe('overlay-boundary: diff parsing + evaluate', () => {
  it('parses name-status incl. renames (new path)', () => {
    const ns = parseNameStatus('A\tsrc/a.ts\nM\tsrc/b.ts\nR100\tsrc/old.ts\tsrc/new.ts');
    expect(ns).toEqual([
      { status: 'A', path: 'src/a.ts' },
      { status: 'M', path: 'src/b.ts' },
      { status: 'R', path: 'src/new.ts' },
    ]);
  });

  it('extracts added lines per file from a unified=0 diff', () => {
    const diff = [
      'diff --git a/src/x.ts b/src/x.ts',
      '--- a/src/x.ts',
      '+++ b/src/x.ts',
      '@@ -0,0 +1,2 @@',
      "+import { a } from '@overlay/x';",
      '+const y = 1;',
    ].join('\n');
    const added = parseAddedLines(diff);
    expect(added.get('src/x.ts')).toEqual(["import { a } from '@overlay/x';", 'const y = 1;']);
  });

  it('evaluate() reports a path violation for an added overlay file', () => {
    const ns = [{ status: 'A', path: 'src/app/api/v2/admin/users/route.ts' }];
    const v = evaluate(ns, new Map());
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('path');
  });

  it('evaluate() reports an import violation on an added line', () => {
    const ns = [{ status: 'M', path: 'src/lib/foo.ts' }];
    const added = new Map([['src/lib/foo.ts', ["import x from '@overlay/billing';"]]]);
    const v = evaluate(ns, added);
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('import');
  });

  it('evaluate() is clean for ordinary additions', () => {
    const ns = [{ status: 'A', path: 'src/lib/foo.ts' }];
    const added = new Map([['src/lib/foo.ts', ["import x from '@/lib/bar';", 'const a = 1;']]]);
    expect(evaluate(ns, added)).toHaveLength(0);
  });
});

describe('DRIFT: overlay-boundary mirrors the carve delete-manifest', () => {
  it('classifyPath catches every delete-manifest path', () => {
    const uncaught = deleteManifestPaths().filter((p) => classifyPath(p) === null);
    expect(uncaught).toEqual([]);
  });

  it('does NOT catch the STUB_TODO kept-in-core files', () => {
    const wronglyCaught = STUB_TODO.map((e) => e.path).filter((p) => classifyPath(p) !== null);
    expect(wronglyCaught).toEqual([]);
  });
});

describe('license-header: isSourceFile', () => {
  it('requires a header on new src source files', () => {
    expect(isSourceFile('src/lib/foo.ts')).toBe(true);
    expect(isSourceFile('src/app/page.tsx')).toBe(true);
  });
  it('exempts declaration / generated / non-src / non-source files', () => {
    expect(isSourceFile('src/types/foo.d.ts')).toBe(false);
    expect(isSourceFile('next-env.d.ts')).toBe(false);
    expect(isSourceFile('scripts/ci/x.mjs')).toBe(false); // not under src/
    expect(isSourceFile('src/app/page.css')).toBe(false);
    expect(isSourceFile('README.md')).toBe(false);
  });
});

describe('license-header: hasLicenseHeader', () => {
  it('accepts the canonical banner', () => {
    expect(hasLicenseHeader(`${CANONICAL_HEADER}\n\nimport x from 'y';\n`)).toBe(true);
  });
  it('accepts a banner below a use-directive', () => {
    const f = `'use client';\n${CANONICAL_HEADER}\nexport const x = 1;\n`;
    expect(hasLicenseHeader(f)).toBe(true);
  });
  it('accepts a bare "Sustainable Use License" mention in the head', () => {
    expect(hasLicenseHeader('// Sustainable Use License\nconst a = 1;\n')).toBe(true);
  });
  it('rejects a file with no header', () => {
    expect(hasLicenseHeader("'use server';\nimport x from 'y';\nexport const a = 1;\n")).toBe(false);
  });
  it('rejects a header buried below the scan window', () => {
    const body = Array.from({ length: 20 }, (_, i) => `const v${i} = ${i};`).join('\n');
    expect(hasLicenseHeader(`${body}\n${CANONICAL_HEADER}\n`)).toBe(false);
  });
});

describe('license-header: parseAddedFiles', () => {
  it('returns only added/renamed-target paths', () => {
    const out = parseAddedFiles('A\tsrc/a.ts\nM\tsrc/b.ts\nD\tsrc/c.ts\nR100\tsrc/old.ts\tsrc/new.ts');
    expect(out).toEqual(['src/a.ts', 'src/new.ts']);
  });
});
