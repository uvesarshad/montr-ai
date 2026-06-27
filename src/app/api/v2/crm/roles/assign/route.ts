import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getCrmPermissionContext,
  assertCanManageSettings,
  crmErrorResponse,
} from '@/lib/crm/permissions';
import { userRepository } from '@/lib/db/repository/user.repository';
import { crmRoleRepository } from '@/lib/db/repository/crm/role.repository';
import { assignRoleSchema } from '@/validations/crm/role.schema';

/**
 * POST /api/v2/crm/roles/assign — assign (or clear with roleId:null) a CRM role
 * to an org member. Requires canManageSettings or platform admin.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getCrmPermissionContext();
    assertCanManageSettings(ctx);

    const body = await request.json();
    const { userId, roleId } = assignRoleSchema.parse(body);

    // Target user must be in the same org.
    const target = await userRepository.findById(userId);
    if (!target) {
      return NextResponse.json({ error: 'User not found in your organization' }, { status: 404 });
    }

    if (roleId) {
      const role = await crmRoleRepository.findById(roleId);
      if (!role) {
        return NextResponse.json({ error: 'Role not found' }, { status: 404 });
      }
    }

    const updated = await userRepository.assignCrmRole(userId, roleId);
    return NextResponse.json({
      success: true,
      userId,
      crmRoleId: updated?.crmRoleId?.toString() ?? null,
    });
  } catch (error) {
    const resp = crmErrorResponse(error);
    if (resp) return resp;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error assigning CRM role:', error);
    return NextResponse.json({ error: 'Failed to assign role' }, { status: 500 });
  }
}
