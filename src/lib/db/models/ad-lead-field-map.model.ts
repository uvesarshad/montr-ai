import mongoose, { Schema, Document, Model } from 'mongoose';
import type { AdPlatform } from '@/lib/db/models/ad-account.model';

/**
 * Per-form mapping from a lead form's custom field keys to CRM identity
 * fields. Consulted by src/lib/ads/crm-intake.ts BEFORE the generic
 * name-based heuristics — needed when forms use custom question keys
 * ("your_work_email", "best_number_to_reach_you", ...).
 */
export interface IAdLeadFieldMap extends Document {
    platform: AdPlatform;
    formId: string;

    /** Lead-form field key → CRM identity slot */
    fieldMap: {
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
    };

    createdAt: Date;
    updatedAt: Date;
}

const AdLeadFieldMapSchema = new Schema<IAdLeadFieldMap>(
    {
        platform: { type: String, enum: ['google_ads', 'meta_ads'], required: true },
        formId: { type: String, required: true },
        fieldMap: {
            firstName: { type: String, default: null },
            lastName: { type: String, default: null },
            email: { type: String, default: null },
            phone: { type: String, default: null },
        },
    },
    {
        timestamps: true,
        collection: 'ad_lead_field_maps',
    }
);

AdLeadFieldMapSchema.index({ platform: 1, formId: 1 }, { unique: true });

// Prevent model recompilation in development
const AdLeadFieldMap: Model<IAdLeadFieldMap> =
    mongoose.models.AdLeadFieldMap || mongoose.model<IAdLeadFieldMap>('AdLeadFieldMap', AdLeadFieldMapSchema);

export default AdLeadFieldMap;
