import { NextResponse } from 'next/server';
import { getCrmPermissionContext, crmErrorResponse } from '@/lib/crm/permissions';
import { userRepository } from '@/lib/db/repository/user.repository';

/** GET /api/v2/crm/members — list org users for the role-assignment UI. */
export async function GET() {
  try {
    const ctx = await getCrmPermissionContext();
    const users = await userRepository.findByOrganization();
    const members = users.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email ?? null,
      crmRoleId: u.crmRoleId ? u.crmRoleId.toString() : null,
    }));
    return NextResponse.json({ members });
  } catch (error) {
    const resp = crmErrorResponse(error);
    if (resp) return resp;
    console.error('Error listing CRM members:', error);
    return NextResponse.json({ error: 'Failed to list members' }, { status: 500 });
  }
}
