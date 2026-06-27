import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repository/user.repository';
import { whatsappCampaignRepository } from '@/lib/db/repository/whatsapp-campaign.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { whatsappContactGroupRepository } from '@/lib/db/repository/whatsapp-contact-group.repository';
import { whatsappMessageRepository, CreateMessageDto } from '@/lib/db/repository/whatsapp-message.repository';
import { whatsappTemplateRepository } from '@/lib/db/repository/whatsapp-template.repository';
import {
  createComplianceWarning,
  getWhatsappIdentifier,
  hasDoNotContact,
  hasMarketingConsent,
  isMarketingTemplate,
  recordComplianceWarning,
} from '@/lib/whatsapp/compliance';
import { checkRateLimitGeneric } from '@/lib/rate-limiter';

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id!;

  try {
    const user = await userRepository.findById(userId);
    const organizationId = user!.id;
    // Throttle campaign launches per org (each fans out to many billed sends).
    const startRate = await checkRateLimitGeneric({
      bucket: 'wa:campaign:start',
      identifier: organizationId.toString(),
      limit: 10,
      windowSeconds: 60,
    });
    if (!startRate.allowed) {
      return NextResponse.json({ error: 'Too many campaign launches. Try again shortly.' }, { status: 429 });
    }

    const campaign = await whatsappCampaignRepository.findById(params.id);

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Verify campaign belongs to organization
    // Check if campaign is already running
    if (campaign.status === 'running') {
      return NextResponse.json(
        { error: 'Campaign is already running' },
        { status: 400 }
      );
    }

    // Check if campaign is completed
    if (campaign.status === 'completed') {
      return NextResponse.json(
        { error: 'Campaign is already completed' },
        { status: 400 }
      );
    }

    const complianceWarnings = [];

    if (campaign.messageType !== 'template') {
      complianceWarnings.push(createComplianceWarning('campaign_not_template', 'Campaign is not template-based (likely non-compliant)', {
        campaignId: campaign._id.toString(),
        messageType: campaign.messageType,
      }));
    }

    const template = campaign.templateId
      ? await whatsappTemplateRepository.findById(campaign.templateId.toString())
      : null;

    if (!template) {
      complianceWarnings.push(createComplianceWarning('campaign_template_missing', 'Template not found (campaign will likely fail)', {
        campaignId: campaign._id.toString(),
        templateId: campaign.templateId?.toString(),
      }));
    } else if (template.status !== 'APPROVED') {
      complianceWarnings.push(createComplianceWarning('campaign_template_unapproved', 'Template not approved by Meta', {
        campaignId: campaign._id.toString(),
        templateId: campaign.templateId?.toString(),
        status: template.status,
      }));
    }

    // Determine target contacts based on targetType
    let targetContactIds: string[] = [];
    const requiresMarketingConsent = template ? isMarketingTemplate(template) : false;

    switch (campaign.targetType) {
      case 'all':
        // Get all contacts in organization
        const allContacts = await contactRepository.findAll();
        targetContactIds = allContacts
          .filter((c) => !!getWhatsappIdentifier(c))
          .map(c => c._id.toString());
        break;

      case 'groups':
        // Get contacts from specified groups
        if (!campaign.targetGroups || campaign.targetGroups.length === 0) {
          return NextResponse.json(
            { error: 'No target groups specified' },
            { status: 400 }
          );
        }

        for (const groupId of campaign.targetGroups) {
          const contactIds = await whatsappContactGroupRepository.getGroupContacts(
            groupId.toString(),
            10000, // limit
            0 // skip
          );

          // Get actual contacts to check for phone number
          const groupContacts = await contactRepository.findAll({
            _id: { $in: contactIds }
          });

          targetContactIds.push(
            ...groupContacts
              .filter((c) => !!getWhatsappIdentifier(c))
              .map(c => c._id.toString())
          );
        }

        // Remove duplicates
        targetContactIds = [...new Set(targetContactIds)];
        break;

      case 'individual':
        // Use specified contacts
        if (!campaign.targetContacts || campaign.targetContacts.length === 0) {
          return NextResponse.json(
            { error: 'No target contacts specified' },
            { status: 400 }
          );
        }

        targetContactIds = campaign.targetContacts.map(c => c.toString());
        break;

      case 'filter':
        // TODO: Implement custom filter logic based on campaign.targetFilter
        return NextResponse.json(
          { error: 'Filter-based targeting not yet implemented' },
          { status: 501 }
        );
    }

    // Final compliance filter (handles individual target lists)
    const targetContacts = await contactRepository.findAll({
      _id: { $in: targetContactIds },
    });

    for (const c of targetContacts) {
      if (hasDoNotContact(c)) {
        await recordComplianceWarning({
          entityType: 'crm_contact',
          entityId: c._id?.toString?.() || String(c._id),
          warning: createComplianceWarning('dnc_contact', 'Contact is marked as do not contact (campaign)', {
            contactId: c._id?.toString?.() || String(c._id),
            campaignId: campaign._id.toString(),
          }),
          userId,
          userName: session.user?.name || session.user?.email || undefined,
          source: 'api',
        });
      }
      if (requiresMarketingConsent && !hasMarketingConsent(c)) {
        await recordComplianceWarning({
          entityType: 'crm_contact',
          entityId: c._id?.toString?.() || String(c._id),
          warning: createComplianceWarning('marketing_consent_missing', 'Marketing consent missing for campaign contact', {
            contactId: c._id?.toString?.() || String(c._id),
            campaignId: campaign._id.toString(),
          }),
          userId,
          userName: session.user?.name || session.user?.email || undefined,
          source: 'api',
        });
      }
    }

    targetContactIds = targetContacts
      .filter((c) => !!getWhatsappIdentifier(c))
      .map((c) => c._id.toString());

    if (targetContactIds.length === 0) {
      return NextResponse.json(
        { error: 'No target contacts found' },
        { status: 400 }
      );
    }

    // Determine send time
    const scheduledAt = campaign.scheduledAt && campaign.scheduledAt > new Date()
      ? campaign.scheduledAt
      : new Date();

    // Create messages for all target contacts
    const messages = [];
    const batchSize = campaign.batchSize || 100;

    for (let i = 0; i < targetContactIds.length; i++) {
      const contactId = targetContactIds[i];

      // Calculate batch delay (spread messages over time)
      const batchNumber = Math.floor(i / batchSize);
      const messageScheduledAt = new Date(scheduledAt.getTime() + (batchNumber * 60000)); // 1 minute between batches

      const messageData: CreateMessageDto = {
        whatsappAccountId: campaign.whatsappAccountId.toString(),
        contactId,
        campaignId: campaign._id.toString(),
        messageType: campaign.messageType as CreateMessageDto['messageType'],
        content: campaign.content ?? '',
        templateId: campaign.templateId?.toString(),
        templateName: template?.name,
        components: [], // Will be resolved at send time if needed
        status: 'scheduled',
        direction: 'outbound',
        scheduledFor: messageScheduledAt,
        extra: { sentBy: userId },
      };

      const message = await whatsappMessageRepository.create(messageData);
      messages.push(message);
    }

    // Update campaign status
    const updatedCampaign = await whatsappCampaignRepository.update(params.id, {
      status: 'running',
      startedAt: new Date(),
      totalContacts: targetContactIds.length,
    });

    for (const warning of complianceWarnings) {
      await recordComplianceWarning({
        entityType: 'whatsapp_campaign',
        entityId: campaign._id.toString(),
        warning,
        userId,
        userName: session.user?.name || session.user?.email || undefined,
        source: 'api',
      });
    }

    return NextResponse.json({
      message: 'Campaign started successfully',
      data: {
        campaign: updatedCampaign,
        messagesCreated: messages.length,
        targetContacts: targetContactIds.length,
      },
    });
  } catch (error) {
    console.error('Error starting campaign:', error);
    return NextResponse.json(
      { error: 'Failed to start campaign', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
