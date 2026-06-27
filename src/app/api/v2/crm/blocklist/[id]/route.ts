import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { blocklistRepository } from '@/lib/db/repository/crm/blocklist.repository';

// DELETE /api/v2/crm/blocklist/[id] - Remove a sender pattern from the blocklist
export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await userRepository.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const ctx = await getCrmPermissionContext(session.user.id);
    assertCanManageSettings(ctx);
    const deleted = await blocklistRepository.delete(params.id);

    if (!deleted) {
      return NextResponse.json({ error: 'Blocklist entry not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Blocklist entry removed' });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting blocklist entry:', error);
    return NextResponse.json({ error: 'Failed to delete blocklist entry' }, { status: 500 });
  }
}
