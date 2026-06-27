import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { emailAccountRepository } from '@/lib/db/repository/crm/email-account.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { sendEmail } from '@/lib/crm/email-sync';

// POST /api/v2/crm/emails/send - Send email
export async function POST(request: NextRequest) {
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
    const {
      accountId,
      to,
      cc,
      bcc,
      subject,
      bodyHtml,
      bodyText,
      replyTo,
      inReplyTo,
      attachments,
      contactId,
      companyId,
      dealId,
    } = body;

    // Validate required fields
    if (!accountId || !to || to.length === 0) {
      return NextResponse.json(
        { error: 'Account ID and recipients are required' },
        { status: 400 }
      );
    }

    if (!bodyHtml && !bodyText) {
      return NextResponse.json(
        { error: 'Email body is required' },
        { status: 400 }
      );
    }

    // Get email account
    const account = await emailAccountRepository.findById(accountId);

    if (!account) {
      return NextResponse.json({ error: 'Email account not found' }, { status: 404 });
    }

    // Verify user owns this account
    if (account.userId.toString() !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Send email
    const result = await sendEmail(account, {
      to,
      cc,
      bcc,
      subject,
      bodyHtml,
      bodyText,
      replyTo,
      inReplyTo,
      attachments,
      contactId,
      companyId,
      dealId,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to send email' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: result.email,
      message: 'Email sent successfully',
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error sending email:', error);
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    );
  }
}
