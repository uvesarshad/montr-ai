import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { whatsappTemplateRepository } from '@/lib/db/repository/whatsapp-template.repository';
import { whatsappAccountRepository } from '@/lib/db/repository/whatsapp-account.repository';
import { createApproval } from '@/lib/approvals';

/**
 * Submit template to Meta for approval
 */
export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id!;

  try {
    // Get template
    const template = await whatsappTemplateRepository.findById(params.id);

    if (!template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }

    // Verify template belongs to organization
    // Get WhatsApp account
    const account = await whatsappAccountRepository.findById(
      template.whatsappAccountId.toString()
    );

    if (!account || !account.accessToken) {
      return NextResponse.json(
        { error: 'WhatsApp account not connected' },
        { status: 400 }
      );
    }

    // Submit to Meta Graph API
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${account.wabaId}/message_templates`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: template.name,
          category: template.category,
          language: template.language,
          components: template.components,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'Failed to submit template',
          details: data.error?.message || 'Unknown error',
        },
        { status: response.status }
      );
    }

    // Update template with Meta template ID and status
    await whatsappTemplateRepository.update(params.id, {
      metaTemplateId: data.id,
      status: 'PENDING',
      submittedAt: new Date(),
    });

    // Mirror into the central approval queue (X4 / B3-5.2). Reviewers see all
    // pending approvals across the platform in one place; the WhatsApp module
    // still owns the template lifecycle.
    await createApproval({
      brandId: template.brandId ? template.brandId.toString() : undefined,
      subjectKind: 'whatsapp-template',
      subjectId: params.id,
      subjectSummary: {
        templateName: template.name,
        category: template.category,
        language: template.language,
        metaTemplateId: data.id,
      },
      submittedBy: userId,
      priority: template.category === 'MARKETING' ? 'normal' : 'high',
    }).catch(err => console.error('Approval-queue mirror failed:', err));

    return NextResponse.json({
      message: 'Template submitted for approval',
      data: {
        templateId: params.id,
        metaTemplateId: data.id,
        status: 'PENDING',
      },
    });
  } catch (error) {
    console.error('Error submitting template:', error);
    return NextResponse.json(
      { error: 'Failed to submit template', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
