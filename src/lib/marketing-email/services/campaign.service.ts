
import MarketingCampaign from '@/lib/db/models/marketing-email/campaign.model';
import MarketingTemplate from '@/lib/db/models/marketing-email/template.model';
import MarketingProvider from '@/lib/db/models/marketing-email/provider.model';
import Contact from '@/lib/db/models/crm/contact.model';
import { ProviderFactory } from '../providers/provider-factory';
import { templateService } from './template.service';
import { trackingService } from './tracking.service';
import mongoose from 'mongoose';

/**
 * Determine which A/B variant to assign to a contact.
 * Uses weighted random selection based on variantA.weight (0-100).
 * Returns 'A' or 'B'.
 */
function selectABVariant(weightA: number = 50): 'A' | 'B' {
    return Math.random() * 100 < weightA ? 'A' : 'B';
}

export class CampaignService {

    /**
     * Send specific campaign (or resume sending)
     * This is usually called by a background job, but can be triggered manually.
     * Supports A/B testing: when isABTest=true, contacts are split between variantA and variantB.
     */
    async processCampaignBatch(campaignId: string): Promise<{ processed: number; completed: boolean }> {
        const campaign = await MarketingCampaign.findById(campaignId);
        if (!campaign || (campaign.status !== 'sending' && campaign.status !== 'scheduled')) {
            return { processed: 0, completed: false };
        }

        // 1. Get Provider
        const provider = await MarketingProvider.findById(campaign.providerId);
        if (!provider) throw new Error('Provider not found');

        const providerService = ProviderFactory.create(provider);

        // 2. Get Template(s)
        const baseTemplate = await MarketingTemplate.findById(campaign.templateId);
        if (!baseTemplate) throw new Error('Template not found');

        // For A/B testing: load variant templates if different from base
        let templateA = baseTemplate;
        let templateB = baseTemplate;

        if (campaign.isABTest) {
            if (campaign.variantA?.templateId &&
                campaign.variantA.templateId.toString() !== campaign.templateId?.toString()) {
                templateA = await MarketingTemplate.findById(campaign.variantA.templateId) || baseTemplate;
            }
            if (campaign.variantB?.templateId &&
                campaign.variantB.templateId.toString() !== campaign.templateId?.toString()) {
                templateB = await MarketingTemplate.findById(campaign.variantB.templateId) || baseTemplate;
            }
        }

        // 3. Get Batch of Recipient Contacts
        const processedContacts = await mongoose.models.MarketingTracking.distinct('contactId', {
            campaignId: campaign._id
        });

        const batchSize = campaign.batchSize || 100;

        // Build query based on targetType
        const query: Record<string, unknown> = {
            _id: { $nin: processedContacts },
            email: { $exists: true, $ne: '' },
            marketingConsent: { $ne: false },
            doNotContact: { $ne: true }
        };

        if (campaign.targetType === 'tags') {
            query.tags = { $in: campaign.targetTags };
        }
        if (campaign.excludeTags && campaign.excludeTags.length > 0) {
            query.tags = { ...(query.tags as Record<string, unknown>), $nin: campaign.excludeTags };
        }

        const contacts = await Contact.find(query)
            .limit(batchSize)
            .select('firstName lastName email data');

        if (contacts.length === 0) {
            // Campaign complete
            campaign.status = 'completed';
            campaign.completedAt = new Date();
            await campaign.save();
            return { processed: 0, completed: true };
        }

        // 4. Update status to sending if needed
        if (campaign.status === 'scheduled') {
            campaign.status = 'sending';
            campaign.startedAt = new Date();
            await campaign.save();
        }

        // 5. Send Emails
        let processedCount = 0;
        const weightA = campaign.variantA?.weight ?? 50;

        for (const contact of contacts) {
            try {
                // Check suppression list
                if (!contact.email) continue;
                const isSuppressed = await trackingService.isSuppressed(
                    contact.email
                );
                if (isSuppressed) continue;

                // A/B variant selection
                let variant: 'A' | 'B' | null = null;
                let activeTemplate = baseTemplate;
                let subjectOverride = campaign.subject;

                if (campaign.isABTest) {
                    variant = selectABVariant(weightA);
                    if (variant === 'A') {
                        activeTemplate = templateA;
                        subjectOverride = campaign.variantA?.subject || campaign.subject;
                    } else {
                        activeTemplate = templateB;
                        subjectOverride = campaign.variantB?.subject || campaign.subject;
                    }
                }

                // Render template
                const { subject, html, text } = templateService.render(activeTemplate, {
                    contact: contact.toObject(),
                    campaign: campaign.toObject()
                });

                // Send
                const result = await providerService.send({
                    to: contact.email as string,
                    subject: subjectOverride || subject,
                    html,
                    text,
                    fromEmail: provider.fromEmail,
                    fromName: provider.fromName,
                    replyTo: provider.replyToEmail || undefined,
                    trackingId: campaign._id.toString(),
                    metadata: {
                        campaignId: campaign._id.toString(),
                        contactId: contact._id.toString(),
                        ...(variant && { abVariant: variant }),
                    }
                });

                // Record 'sent' event with variant info
                await trackingService.recordEvent(
                    campaign.createdById.toString(),
                    result.messageId,
                    'sent',
                    {
                        campaignId: campaign._id.toString(),
                        contactId: contact._id.toString(),
                        email: contact.email,
                        providerId: provider._id.toString(),
                        ...(variant && { abVariant: variant }),
                    }
                );

                processedCount++;

            } catch (error) {
                console.error(`Failed to send to ${contact.email}`, error);
            }
        }

        // 6. Update progress
        campaign.processedCount += processedCount;
        await campaign.save();

        return { processed: processedCount, completed: false };
    }
}


export const campaignService = new CampaignService();
