import mongoose, { Schema, Document, Model } from 'mongoose';
import type { AdPlatform } from '@/lib/db/models/ad-account.model';

/**
 * Audit trail for EVERY write call made to an ads platform.
 *
 * Part of the hard guardrail (docs/ads-analytics-plan.md §3.4): all writes
 * are create-only, user-initiated, and logged here — there are no
 * background mutation jobs anywhere in the codebase.
 */
export interface IAdWriteAudit extends Document {
    brandId: string;
    /** The user whose explicit action triggered this write */
    userId: string;
    adAccountId: string;
    platform: AdPlatform;

    /** Allowlisted operation name, e.g. 'create_campaign', 'create_adset' */
    operation: string;
    /** Sanitized request payload (never contains tokens) */
    request: Record<string, unknown>;
    /** Platform-assigned IDs / resource names on success */
    result?: Record<string, unknown>;

    status: 'success' | 'error';
    error?: string;

    createdAt: Date;
    updatedAt: Date;
}

const AdWriteAuditSchema = new Schema<IAdWriteAudit>(
    {
        brandId: { type: String, required: true },
        userId: { type: String, required: true },
        adAccountId: { type: String, required: true },
        platform: { type: String, enum: ['google_ads', 'meta_ads'], required: true },
        operation: { type: String, required: true },
        request: { type: Schema.Types.Mixed, required: true },
        result: { type: Schema.Types.Mixed, default: null },
        status: { type: String, enum: ['success', 'error'], required: true },
        error: { type: String, default: null },
    },
    {
        timestamps: true,
        collection: 'ad_write_audits',
    }
);

AdWriteAuditSchema.index({ createdAt: -1 });
AdWriteAuditSchema.index({ adAccountId: 1, createdAt: -1 });

// Prevent model recompilation in development
const AdWriteAudit: Model<IAdWriteAudit> =
    mongoose.models.AdWriteAudit || mongoose.model<IAdWriteAudit>('AdWriteAudit', AdWriteAuditSchema);

export default AdWriteAudit;
