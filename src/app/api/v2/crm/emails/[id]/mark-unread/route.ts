import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { emailRepository } from '@/lib/db/repository/crm/email.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';

// POST /api/v2/crm/emails/[id]/mark-unread - Mark email as unread
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    // Get user's organizationId
    const user = await userRepository.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'update');

    const email = await emailRepository.markAsUnread(params.id);

    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    return NextResponse.json({
      data: email,
      message: 'Email marked as unread',
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error marking email as unread:', error);
    return NextResponse.json(
      { error: 'Failed to mark email as unread' },
      { status: 500 }
    );
  }
}
