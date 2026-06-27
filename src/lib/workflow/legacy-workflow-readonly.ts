/**
 * Legacy workflow read-only gate.
 *
 * Bundle 2 consolidation freezes the `crm_workflows` and `whatsapp_workflows`
 * systems in favour of `unified_workflows`. Once the migrator has run in a
 * given environment, the legacy systems should be sealed so admins cannot
 * create new docs (which would never get migrated) and users cannot edit
 * docs that have already been migrated (which would diverge from the unified
 * copy).
 *
 * Toggle via env var:
 *   WORKFLOW_CONSOLIDATION_READONLY=true   → block all writes to legacy systems
 *
 * GET / list / read endpoints stay open so users can still inspect their data
 * after the cutover. Writes return 409 with a structured payload pointing the
 * caller at the unified surface.
 */

import { NextResponse } from 'next/server';

export type LegacySystem = 'crm_workflows' | 'whatsapp_workflows';

const READONLY_FLAG_ENV = 'WORKFLOW_CONSOLIDATION_READONLY';

/**
 * True if the env flag is set to a truthy value. Treated case-insensitively;
 * accepts `1`, `true`, `yes`, `on` as truthy.
 */
export function isLegacyReadOnly(): boolean {
  const raw = process.env[READONLY_FLAG_ENV];
  if (!raw) return false;
  const normalized = raw.toString().trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

interface DenyOptions {
  system: LegacySystem;
  /** Optional override for the unified replacement surface path. */
  unifiedPath?: string;
}

/**
 * Build a 409 response explaining the read-only seal and pointing at the
 * unified workflow surface. Use from API route handlers like:
 *
 *   const sealed = denyIfReadOnly({ system: 'crm_workflows' });
 *   if (sealed) return sealed;
 */
export function denyIfReadOnly(options: DenyOptions): NextResponse | null {
  if (!isLegacyReadOnly()) return null;

  return NextResponse.json(
    {
      error: 'Legacy workflow system is read-only',
      reason: `${options.system} writes are sealed during the unified-workflow consolidation. ` +
        'Existing workflows still execute; new workflows must be created in the unified canvas.',
      unifiedSurface: options.unifiedPath ?? '/api/v2/canvases',
      migrationDoc: 'temp/audit/workflow-node-matrix.md',
      flag: READONLY_FLAG_ENV,
    },
    { status: 409 }
  );
}
