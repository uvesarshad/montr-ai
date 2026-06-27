import mongoose, { Schema, Document, Model } from 'mongoose';
import type { AdPlatform } from '@/lib/db/models/ad-account.model';

/**
 * A lead captured from an ads platform (Meta Lead Ads / Google Ads lead
 * forms). Every webhook delivery is stored here first, then bridged into
 * the CRM via src/lib/ads/crm-intake.ts — so failed CRM syncs can be
 * inspected and retried from the Ads ▸ Leads view.
 */
export type AdLeadStatus = 'received' | 'synced' | 'failed' | 'skipped';

export interface IAdLead extends Document {
    brandId: string;

    platform: AdPlatform;
    /** Our AdAccount._id when the lead could be attributed to a connection */
    adAccountId?: string;
    /** Meta leadgen_id / Google lead_id — webhook dedupe key */
    externalLeadId: string;

    campaignId?: string;
    campaignName?: string;
    adsetId?: string;
    adId?: string;
    formId?: string;
    formName?: string;
    pageId?: string;       // meta only
    isTest?: boolean;      // google sends is_test for form previews

    /** Raw answer map exactly as the platform delivered it */
    fields: Record<string, string>;

    // Extracted identity fields (best-effort from `fields`)
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;

    /** Resolved CRM contact after a successful sync */
    contactId?: string;
    status: AdLeadStatus;
    error?: string;

    receivedAt: Date;
    syncedAt?: Date;

    createdAt: Date;
    updatedAt: Date;
}

const AdLeadSchema = new Schema<IAdLead>(
    {
        brandId: {
            type: String,
            required: true,
            index: true,
        },
        platform: {
            type: String,
            enum: ['google_ads', 'meta_ads'],
            required: true,
        },
        adAccountId: {
            type: String,
            default: null,
        },
        externalLeadId: {
            type: String,
            required: true,
        },
        campaignId: { type: String, default: null },
        campaignName: { type: String, default: null },
        adsetId: { type: String, default: null },
        adId: { type: String, default: null },
        formId: { type: String, default: null },
        formName: { type: String, default: null },
        pageId: { type: String, default: null },
        isTest: { type: Boolean, default: false },
        fields: {
            type: Schema.Types.Mixed,
            required: true,
            default: {},
        },
        email: { type: String, default: null },
        phone: { type: String, default: null },
        firstName: { type: String, default: null },
        lastName: { type: String, default: null },
        contactId: { type: String, default: null },
        status: {
            type: String,
            enum: ['received', 'synced', 'failed', 'skipped'],
            default: 'received',
        },
        error: { type: String, default: null },
        receivedAt: {
            type: Date,
            required: true,
        },
        syncedAt: { type: Date, default: null },
    },
    {
        timestamps: true,
        collection: 'ad_leads',
    }
);

// Webhook dedupe — platforms may redeliver
AdLeadSchema.index({ platform: 1, externalLeadId: 1 }, { unique: true });
AdLeadSchema.index({ receivedAt: -1 });
AdLeadSchema.index({ brandId: 1, receivedAt: -1 });
AdLeadSchema.index({ status: 1 });

// Prevent model recompilation in development
const AdLead: Model<IAdLead> =
    mongoose.models.AdLead || mongoose.model<IAdLead>('AdLead', AdLeadSchema);

export default AdLead;
