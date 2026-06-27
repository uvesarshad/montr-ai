import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getCrmPermissionContext,
  assertCanManageSettings,
  crmErrorResponse,
} from '@/lib/crm/permissions';
import { crmRoleRepository } from '@/lib/db/repository/crm/role.repository';
import { createRoleSchema } from '@/validations/crm/role.schema';

/** GET /api/v2/crm/roles — list roles (seeds defaults lazily). */
export async function GET() {
  try {
    const ctx = await getCrmPermissionContext();
    const roles = await crmRoleRepository.findAll();
    return NextResponse.json({ roles });
  } catch (error) {
    const resp = crmErrorResponse(error);
    if (resp) return resp;
    console.error('Error listing CRM roles:', error);
    return NextResponse.json({ error: 'Failed to list roles' }, { status: 500 });
  }
}

/** POST /api/v2/crm/roles — create a custom role. Requires canManageSettings. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getCrmPermissionContext();
    assertCanManageSettings(ctx);

    const body = await request.json();
    const data = createRoleSchema.parse(body);

    const existing = await crmRoleRepository.findByName(data.name);
    if (existing) {
      return NextResponse.json({ error: 'A role with this name already exists' }, { status: 409 });
    }

    const role = await crmRoleRepository.create({
      name: data.name,
      description: data.description,
      permissions: data.permissions,
      canManageSettings: data.canManageSettings,
    });

    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    const resp = crmErrorResponse(error);
    if (resp) return resp;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Error creating CRM role:', error);
    return NextResponse.json({ error: 'Failed to create role' }, { status: 500 });
  }
}
