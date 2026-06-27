
import MarketingTracking from '@/lib/db/models/marketing-email/tracking.model';
import MarketingCampaign from '@/lib/db/models/marketing-email/campaign.model';
import MarketingSuppression from '@/lib/db/models/marketing-email/suppression.model';
import { Types } from 'mongoose';
import {
    emitMarketingEmailSent,
    emitMarketingEmailOpened,
    emitMarketingEmailClicked,
    emitMarketingEmailBounced,
    emitMarketingEmailUnsubscribed,
} from '@/lib/crm/event-handlers';

export type TrackingEventType = 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'unsubscribed';

export class TrackingService {
    /**
     * Record a tracking event
     */
    async recordEvent(
        organizationId: string,
        messageId: string, // Provide's message ID
        type: TrackingEventType,
        metadata: {
            campaignId?: string;
            contactId?: string;
            workflowId?: string;
            executionId?: string;
            email?: string;
            providerId?: string;
            url?: string;
            userAgent?: string;
            ipAddress?: string;
            bounceType?: 'hard' | 'soft';
            bounceReason?: string;
            complaintType?: string;
        }
    ) {
        let tracking = await MarketingTracking.findOne({ messageId });

        // If no tracking record exists (e.g. for 'sent' event or if 'sent' was missed), create one
        if (!tracking) {
            if (!metadata.campaignId || !metadata.email || !metadata.providerId) {
                console.warn(`Cannot create tracking record for ${type} without required metadata`);
                return;
            }

            tracking = new MarketingTracking({
                campaignId: new Types.ObjectId(metadata.campaignId),
                contactId: metadata.contactId ? new Types.ObjectId(metadata.contactId) : undefined,
                workflowId: metadata.workflowId ? new Types.ObjectId(metadata.workflowId) : undefined,
                executionId: metadata.executionId ? new Types.ObjectId(metadata.executionId) : undefined,
                email: metadata.email,
                messageId,
                providerId: new Types.ObjectId(metadata.providerId),
            });
        }

        // Update specific event fields
        const now = new Date();
        const update: Record<string, unknown> = {};
        const campaignUpdate: Record<string, number> = {};

        switch (type) {
            case 'sent':
                if (!tracking.sentAt) {
                    update.sentAt = now;
                    campaignUpdate['stats.sent'] = 1;
                }
                break;
            case 'delivered':
                if (!tracking.deliveredAt) {
                    update.deliveredAt = now;
                    campaignUpdate['stats.delivered'] = 1;
                }
                break;
            case 'opened':
                update.openedAt = now;
                update.$inc = { openCount: 1 };
                update.lastUserAgent = metadata.userAgent;
                update.lastIpAddress = metadata.ipAddress;
                if (!tracking.openedAt) {
                    campaignUpdate['stats.opened'] = 1;
                }
                break;
            case 'clicked':
                update.clickedAt = now;
                update.$inc = { clickCount: 1 };
                update.$push = {
                    clickedUrls: {
                        url: metadata.url,
                        clickedAt: now,
                        userAgent: metadata.userAgent,
                        ipAddress: metadata.ipAddress,
                    }
                };
                update.lastUserAgent = metadata.userAgent; // Update active user agent
                if (!tracking.clickedAt) {
                    campaignUpdate['stats.clicked'] = 1;
                }
                break;
            case 'bounced':
                if (!tracking.bouncedAt) {
                    update.bouncedAt = now;
                    update.bounceType = metadata.bounceType;
                    update.bounceReason = metadata.bounceReason;
                    campaignUpdate['stats.bounced'] = 1;

                    // Auto-suppress hard bounces
                    if (metadata.bounceType === 'hard') {
                        await this.addToSuppression(tracking.email, 'bounced', tracking.campaignId?.toString(), metadata.bounceReason);
                    }
                }
                break;
            case 'complained':
                if (!tracking.complainedAt) {
                    update.complainedAt = now;
                    update.complaintType = metadata.complaintType;
                    campaignUpdate['stats.complained'] = 1;

                    // Auto-suppress complaints
                    await this.addToSuppression(tracking.email, 'complained', tracking.campaignId?.toString());
                }
                break;
            case 'unsubscribed':
                if (!tracking.unsubscribedAt) {
                    update.unsubscribedAt = now;
                    campaignUpdate['stats.unsubscribed'] = 1;

                    // Auto-suppress unsubscribes
                    await this.addToSuppression(tracking.email, 'unsubscribed', tracking.campaignId?.toString());
                }
                break;
        }

        // Apply updates
        if (Object.keys(update).length > 0) {
            Object.assign(tracking, update);
            await tracking.save();
        }

        if (Object.keys(campaignUpdate).length > 0 && tracking.campaignId) {
            // Use $inc for stats to be atomic
            await MarketingCampaign.findByIdAndUpdate(tracking.campaignId, { $inc: campaignUpdate });
        }

        // Emit CRM Events
        if (metadata.campaignId && metadata.email) {
            const contactId = metadata.contactId || tracking.contactId?.toString();
            if (contactId) {
                switch (type) {
                    case 'sent':
                        await emitMarketingEmailSent(metadata.campaignId, contactId, metadata.email, messageId);
                        break;
                    case 'opened':
                        if (!tracking.openedAt) { // Only trigger on first open (this check might be redundant if openedAt was just set, but safe)
                            await emitMarketingEmailOpened(metadata.campaignId, contactId, metadata.email);
                        }
                        break;
                    case 'clicked':
                        await emitMarketingEmailClicked(metadata.campaignId, contactId, metadata.email, metadata.url || '');
                        break;
                    case 'bounced':
                        // trigger on first bounce
                        if (!tracking.bouncedAt || tracking.bouncedAt.getTime() === now.getTime()) {
                            await emitMarketingEmailBounced(metadata.campaignId, contactId, metadata.email, metadata.bounceType || 'unknown', metadata.bounceReason);
                        }
                        break;
                    case 'unsubscribed':
                        if (!tracking.unsubscribedAt || tracking.unsubscribedAt.getTime() === now.getTime()) {
                            await emitMarketingEmailUnsubscribed(metadata.campaignId, contactId, metadata.email);
                        }
                        break;
                }
            }
        }
    }

    /**
     * Add email to suppression list
     */
    async addToSuppression(
        email: string,
        reason: 'bounced' | 'complained' | 'unsubscribed',
        campaignId?: string,
        notes?: string
    ) {
        try {
            await MarketingSuppression.create({
                email: email.toLowerCase().trim(),
                reason,
                campaignId: campaignId ? new Types.ObjectId(campaignId) : undefined,
                createdById: undefined, // System action
                notes
            });
        } catch (error: unknown) {
            const err = error as { code?: number };
            if (err.code !== 11000) { // Ignore duplicate key errors (already suppressed)
                console.error('Failed to add to suppression list', error);
            }
        }
    }

    /**
     * Check if email is suppressed
     */
    async isSuppressed(email: string): Promise<boolean> {
        const count = await MarketingSuppression.countDocuments({
            email: email.toLowerCase().trim()
        });
        return count > 0;
    }
}

export const trackingService = new TrackingService();
