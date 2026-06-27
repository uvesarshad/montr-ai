# Authorization

> Scope: Role model, permission checks, and multi-tenancy enforcement.
> Rendering context: Server-side (enforced in middleware and route handlers)
> Project tier: 4
> Last updated: 2026-06-05

## Overview

MontrAI uses three roles (user, admin, super_admin) with route-level enforcement in middleware.ts and data-level enforcement via organizationId scoping in every repository query. Plan-based feature gating is an additional layer enforced per-operation via src/lib/plan-enforcement.ts.

## Role Model

- user — standard tenant member. Can access all (app)/ routes. Scoped to their own data and their organization's data.
- admin — organization administrator. Can access /admin routes and /api/v2/admin routes. Can manage users within their organization.
- super_admin — platform operator. Elevated admin access. Identified by email address (src/lib/auth/super-admin.ts checks against a hardcoded or environment-configured list). Can access all admin routes regardless of organization.

Roles are stored in the users collection and carried in the JWT token (role field). Role changes take effect within 60 seconds due to the JWT cache TTL in auth.ts.

AGENT NOTE: Role is stored in the JWT. Changes in the DB propagate after the 60-second jwtUserCache TTL expires. Do not design flows that require instantaneous role change propagation.

## Permission Check Locations

### Middleware (middleware.ts) — Route-level
Checks role for adminRoutes (path prefix /admin, /organizations, /api/admin, /api/v2/admin). Any role other than admin or super_admin receives 403 (API) or redirects to / (pages).

### Route Handlers — Operation-level
Each API route handler calls auth() to get the session, then checks the role field where the operation requires it. Admin-only operations (e.g., user management, plan assignment) perform an explicit role check before proceeding.

### Repository Layer — Data-level (Multi-tenancy)
All CRM repository queries filter by organizationId. The organizationId is always derived from the authenticated user's record in the users collection — never from request parameters.

Pattern used in route handlers:
The route handler calls auth() to get userId, then calls the user repository to fetch the user and read their organizationId. This organizationId is passed to every subsequent repository call.

### Plan Enforcement — Feature-level
src/lib/plan-enforcement.ts provides functions (e.g., canCreateContact, canSyncEmail) that check the user's active plan features against the plan record in MongoDB. These checks happen in route handlers before write operations. Free plan defaults are defined in DEFAULT_FREE_PLAN_FEATURES.

## Organization Model

One user record acts as the organization admin (adminId on the organization document). Other users reference the organization via organizationId on their user record. Members array on the organization document tracks all member user IDs.

Organization membership is set at user creation or invitation. Users without an organizationId are treated as individual users and cannot access multi-tenant CRM features.

## Multi-Tenancy Invariants

Every CRM model (crm_contacts, crm_companies, crm_deals, crm_pipelines, crm_activities, crm_tags, and all others) has organizationId as a required indexed field. Every CRM repository query includes organizationId in the filter. Route handlers must never forward a client-supplied organizationId — it must always be read from the session.

Canvases use userId (string, not ObjectId) as the primary owner key. organizationId is optional on canvases and backfilled lazily for legacy rows. Canvas queries may filter by either userId or organizationId depending on the use case.

AGENT AVOID: Adding a CRM route that accepts organizationId in the request body and passes it directly to a repository method. Always read organizationId from the session.

## CRM RBAC (per-entity role layer)

A role-based access layer sits on top of org scoping for the CRM module. It does not replace multi-tenancy — every query still filters by organizationId — it adds per-entity, per-action gating within an organization. Modeled on Twenty's Role/ObjectPermission.

### CrmRole model
Defined in src/lib/db/models/crm/role.model.ts (collection crm_roles). Org-scoped: organizationId is a string (not ObjectId). Unique compound index on { organizationId, name }.

Each role carries per-entity permissions for four CRM entities (contact, company, deal, activity). Each entity permission is an object: read / update / delete are scopes ('all' | 'own' | 'none'); create / export are booleans. The role also has canManageSettings (boolean) and isSystem (boolean, true for seeded defaults).

Defaults are lazily seeded per org from DEFAULT_CRM_ROLES (all three apply the same matrix uniformly across all four entities):
- Admin — canManageSettings true; read all, create true, update all, delete all, export true.
- Member — canManageSettings false; read all, create true, update all, delete own, export true.
- Read only — canManageSettings false; read all, create false, update none, delete none, export false.

### Assignment and precedence
A user references a role via User.crmRoleId (src/lib/db/models/user.model.ts; ref CrmRole, nullable). Precedence, highest first:
1. Platform role admin / super_admin — bypasses ALL CRM RBAC (full access).
2. A non-null crmRoleId — the resolved CrmRole governs access.
3. crmRoleId null — legacy full access (back-compat for orgs not using RBAC).

AGENT NOTE: A null crmRoleId is NOT "no access" — it means unrestricted (full access). RBAC only restricts users who have an explicit CrmRole assigned and are not platform admins.

### Enforcement
All enforcement lives in src/lib/crm/permissions.ts and is invoked inside CRM route handlers under src/app/api/v2/crm.

- getCrmPermissionContext(userId) — resolves the per-request context once (userId, organizationId, isPlatformAdmin, role). Role lookup is per-request only; no cross-request cache. Throws CrmAuthError (401 no session / 403 no org).
- assertCrmPermission(ctx, entity, action) — throws CrmPermissionError (403) when denied; returns { scope }. Platform admins and null-role contexts always pass with scope 'all'.
- 'own' scope on list reads adds an owner filter (ownerId for contact/company/deal, assignedTo for activity — see ownerFieldFor). On single-record mutations, ownsRecord verifies the record belongs to the user, else 403.
- assertBulkCrmPermission(ctx, entity, action) — for bulk endpoints; own-scope users are rejected with 403 because the repositories are not owner-aware (own-scope users must use single-record routes).
- assertCanManageSettings(ctx) — gates settings mutations: pipelines, custom-fields, tags CUD, dedupe-rules, record-layouts, webhooks, email-accounts CUD, roles, and manual-automation runs. Platform admins and null-role pass.
- Export permission gates the CRM export routes.
- crmErrorResponse(error) — translates a thrown CrmPermissionError / CrmAuthError into the matching NextResponse.

AGENT AVOID: Performing a CRM read or mutation in a route handler without first calling getCrmPermissionContext + assertCrmPermission (or assertBulkCrmPermission / assertCanManageSettings). Org scoping alone is no longer sufficient for CRM routes.

### Management surface
- Role CRUD: /api/v2/crm/roles (+ /api/v2/crm/roles/[id]).
- Assignment: /api/v2/crm/roles/assign.
- Org members listing: /api/v2/crm/members.
- UI: /crm/settings/roles.

## Credential Isolation

AI provider credentials per-organization are stored encrypted using src/lib/workflow/credential-encryption.ts. Decryption happens at execution time inside the unified-execution-engine.ts and is never exposed to the client.

AGENT UPDATE: Update this file when roles are added or removed, when the permission check location changes, or when the multi-tenancy enforcement pattern changes.

## Related Docs

- docs/auth/auth-flow.md — Session and JWT details
- docs/architecture/data-flow.md — organizationId in the request lifecycle
- docs/api/database.md — organizationId on model schemas
