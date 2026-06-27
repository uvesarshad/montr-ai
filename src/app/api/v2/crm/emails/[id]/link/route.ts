import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { emailRepository } from '@/lib/db/repository/crm/email.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';

// POST /api/v2/crm/emails/[id]/link - Link email to contact/company/deal
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
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

    const body = await request.json();
    const { contactId, companyId, dealId } = body;

    if (!contactId && !companyId && !dealId) {
      return NextResponse.json(
        { error: 'At least one link (contactId, companyId, or dealId) is required' },
        { status: 400 }
      );
    }

    const email = await emailRepository.linkToEntity(params.id, {
      contactId,
      companyId,
      dealId,
    });

    if (!email) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 });
    }

    return NextResponse.json({
      data: email,
      message: 'Email linked successfully',
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error linking email:', error);
    return NextResponse.json(
      { error: 'Failed to link email' },
      { status: 500 }
    );
  }
}
