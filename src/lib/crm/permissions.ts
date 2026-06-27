// OSS carve stub (always-allow) of src/lib/crm/permissions.ts — single-tenant, unmetered.
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import type {
  CrmEntity,
  CrmScope,
  ICrmRole,
} from '@/lib/db/models/crm/role.model';

export type CrmAction = 'read' | 'create' | 'update' | 'delete' | 'export';

export interface CrmPermissionContext {
  userId: string;
  /** Platform admins (role admin/super_admin) bypass ALL CRM permission checks. */
  isPlatformAdmin: boolean;
  /** Resolved CrmRole, or null = full access (back-compat for orgs not using RBAC). */
  role: ICrmRole | null;
}

export class CrmPermissionError extends Error {
  status: number;
  constructor(message = 'Forbidden', status = 403) {
    super(message);
    this.name = 'CrmPermissionError';
    this.status = status;
  }
}

/** Thrown when there is no authenticated user — surfaces as 401/403. */
export class CrmAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'CrmAuthError';
    this.status = status;
  }
}

/**
 * Resolve the per-request permission context for the current session user.
 * OSS single-tenant: there is no CRM RBAC — every authenticated user has full
 * (scope 'all') access. Only the userId is resolved; no role/plan lookups.
 * Throws CrmAuthError(401) when there is no authenticated session.
 */
export async function getCrmPermissionContext(
  userId?: string
): Promise<CrmPermissionContext> {
  let resolvedUserId = userId;

  if (!resolvedUserId) {
    const session = await getSession();
    if (!session?.user?.id) {
      throw new CrmAuthError('Unauthorized', 401);
    }
    resolvedUserId = session.user.id;
  }

  return {
    userId: resolvedUserId,
    isPlatformAdmin: true,
    role: null,
  };
}

export interface ScopeResult {
  /** Effective scope for the action. 'all' = unrestricted; 'own' = owner-filtered. */
  scope: CrmScope;
}

/**
 * Assert that the context may perform `action` on `entity`.
 * OSS single-tenant: always passes with full scope. Returns `{ scope: 'all' }`
 * so callers' owner-filter logic short-circuits to "unrestricted".
 */
export function assertCrmPermission(
  _ctx: CrmPermissionContext,
  _entity: CrmEntity,
  _action: CrmAction
): ScopeResult {
  return { scope: 'all' };
}

/**
 * Assert the context may manage CRM settings (pipelines, custom-fields, dedupe,
 * layouts, webhooks, roles, etc.). OSS single-tenant: always passes (no-op).
 */
export function assertCanManageSettings(_ctx: CrmPermissionContext): void {
  return;
}

/** Owner field used by each entity for ownership scoping. */
export function ownerFieldFor(entity: CrmEntity): 'ownerId' | 'assignedTo' {
  return entity === 'activity' ? 'assignedTo' : 'ownerId';
}

/**
 * For 'own'-scoped single-record mutations: verify the record belongs to the
 * user. OSS single-tenant: ownership is never restricted, so always true.
 */
export function ownsRecord(
  _ctx: CrmPermissionContext,
  _entity: CrmEntity,
  _record: Record<string, unknown> | null | undefined
): boolean {
  return true;
}

/**
 * Convenience for bulk endpoints: assert the action and reject own-scope users.
 * OSS single-tenant: scope is always 'all', so this always passes (no-op).
 */
export function assertBulkCrmPermission(
  ctx: CrmPermissionContext,
  entity: CrmEntity,
  action: CrmAction
): void {
  const { scope } = assertCrmPermission(ctx, entity, action);
  if (scope === 'own') {
    throw new CrmPermissionError(`Bulk ${action} requires full access to ${entity}`);
  }
}

/** Translate any thrown permission/auth error into a NextResponse. */
export function crmErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof CrmPermissionError || error instanceof CrmAuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}
