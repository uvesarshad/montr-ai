import mongoose, { Schema, Document, Model } from 'mongoose';

export type IntegrationImportProvider = 'mailchimp' | 'hubspot';
export type IntegrationImportRecordType = 'contact' | 'company' | 'deal' | 'audience_member';

/**
 * A single imported audience/contact record from a third-party integration
 * (Mailchimp, HubSpot, …). This is a provider-agnostic STAGING store — imported
 * data deliberately does NOT land in the CRM module (explicit product decision).
 *
 * Records are keyed by their provider-side externalId and deduplicated per
 * organization + provider + recordType, so re-running an import upserts in place
 * (refreshing `data` and `lastSyncedAt`) instead of duplicating.
 */
export interface IIntegrationImportRecord extends Document {
    brandId?: string | null;
    connectionId: string;
    provider: IntegrationImportProvider;
    recordType: IntegrationImportRecordType;

    /** Provider-side identity of the record (member id, contact id, …). */
    externalId: string;
    /** Mailchimp audience id / HubSpot list id this record belongs to, if any. */
    externalListId?: string | null;

    email?: string | null;
    name?: string | null;

    /** Full normalized record as returned by the provider. */
    data: Record<string, unknown>;

    importedAt: Date;
    lastSyncedAt?: Date | null;

    createdAt: Date;
    updatedAt: Date;
}

const IntegrationImportRecordSchema = new Schema<IIntegrationImportRecord>(
    {
        brandId: {
            type: String,
            default: null,
        },
        connectionId: {
            type: String,
            required: true,
        },
        provider: {
            type: String,
            enum: ['mailchimp', 'hubspot'],
            required: true,
        },
        recordType: {
            type: String,
            enum: ['contact', 'company', 'deal', 'audience_member'],
            required: true,
        },
        externalId: {
            type: String,
            required: true,
        },
        externalListId: {
            type: String,
            default: null,
        },
        email: {
            type: String,
            default: null,
            index: true,
        },
        name: {
            type: String,
            default: null,
        },
        data: {
            type: Schema.Types.Mixed,
            default: {},
        },
        importedAt: {
            type: Date,
            default: Date.now,
        },
        lastSyncedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'integration_import_records',
    }
);

// Dedup key — re-importing the same external record upserts in place.
IntegrationImportRecordSchema.index(
    { provider: 1, recordType: 1, externalId: 1 },
    { unique: true }
);
// List/browse queries.
IntegrationImportRecordSchema.index({ provider: 1, recordType: 1 });
IntegrationImportRecordSchema.index({ email: 1 });

const IntegrationImportRecord: Model<IIntegrationImportRecord> =
    mongoose.models.IntegrationImportRecord ||
    mongoose.model<IIntegrationImportRecord>(
        'IntegrationImportRecord',
        IntegrationImportRecordSchema
    );

export default IntegrationImportRecord;
