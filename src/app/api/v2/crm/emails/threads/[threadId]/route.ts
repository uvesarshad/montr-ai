import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { emailRepository } from '@/lib/db/repository/crm/email.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';

// GET /api/v2/crm/emails/threads/[threadId] - Get email thread
export async function GET(_request: NextRequest, props: { params: Promise<{ threadId: string }> }) {
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
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'read');

    const emails = await emailRepository.findThread(params.threadId);

    return NextResponse.json({
      data: emails,
      total: emails.length,
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching email thread:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email thread' },
      { status: 500 }
    );
  }
}
