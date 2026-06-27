import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getCrmPermissionContext,
  assertCanManageSettings,
  crmErrorResponse,
} from '@/lib/crm/permissions';
import { crmRoleRepository } from '@/lib/db/repository/crm/role.repository';
import { updateRoleSchema } from '@/validations/crm/role.schema';

/** GET /api/v2/crm/roles/[id] */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await getCrmPermissionContext();
    const role = await crmRoleRepository.findById(params.id);
    if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    return NextResponse.json(role);
  } catch (error) {
    const resp = crmErrorResponse(error);
    if (resp) return resp;
    console.error('Error fetching CRM role:', error);
    return NextResponse.json({ error: 'Failed to fetch role' }, { status: 500 });
  }
}

/**
 * PUT /api/v2/crm/roles/[id] — edit a role. System roles may have their
 * permissions edited EXCEPT the Admin role (immutable); their name cannot be
 * changed. Requires canManageSettings.
 */
export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await getCrmPermissionContext();
    assertCanManageSettings(ctx);

    const role = await crmRoleRepository.findById(params.id);
    if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 });

    if (role.isSystem && role.name === 'Admin') {
      return NextResponse.json({ error: 'The Admin role cannot be modified' }, { status: 403 });
    }

    const body = await request.json();
    const data = updateRoleSchema.parse(body);

    // System roles keep their identity: ignore name changes.
    const update: typeof data = { ...data };
    if (role.isSystem) {
      delete update.name;
    } else if (update.name && update.name !== role.name) {
      const dup = await crmRoleRepository.findByName(update.name);
      if (dup && dup._id.toString() !== role._id.toString()) {
        return NextResponse.json({ error: 'A role with this name already exists' }, { status: 409 });
      }
    }

    const updated = await crmRoleRepository.update(params.id, update);
    return NextResponse.json(updated);
  } catch (error) {
    const resp = crmErrorResponse(error);
    if (resp) return resp;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error updating CRM role:', error);
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
  }
}

/** DELETE /api/v2/crm/roles/[id] — non-system roles only. */
export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx = await getCrmPermissionContext();
    assertCanManageSettings(ctx);

    const role = await crmRoleRepository.findById(params.id);
    if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    if (role.isSystem) {
      return NextResponse.json({ error: 'System roles cannot be deleted' }, { status: 403 });
    }

    // Unassign this role from any users still holding it (org-scoped).
    const { userRepository } = await import('@/lib/db/repository/user.repository');
    await userRepository.clearCrmRole(params.id);

    await crmRoleRepository.delete(params.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const resp = crmErrorResponse(error);
    if (resp) return resp;
    console.error('Error deleting CRM role:', error);
    return NextResponse.json({ error: 'Failed to delete role' }, { status: 500 });
  }
}
