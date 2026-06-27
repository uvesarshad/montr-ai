import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * White-label reporting profile (Epic 9 — agency white-labelling).
 *
 * REPORTING ONLY. An org/agency on a plan with `allowWhiteLabel` may propose
 * its own branding for social reports. Proposed branding lands in `pending` with
 * status `pending`; it goes LIVE (copied into `live`, status `approved`) only
 * after a super-admin approves it. A reject keeps `pending` so the org can see
 * the reviewer note and resubmit.
 *
 * Multi-tenant: one document per org (`organizationId` unique). Always query by
 * the org derived from the session user — never a client-supplied id.
 */

export interface WhiteLabelBranding {
    companyName: string;
    logoUrl?: string;
    primaryColor?: string;
    accentColor?: string;
    supportEmail?: string;
    footerText?: string;
    customDomain?: string;
}

export type WhiteLabelStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface IWhiteLabelProfile extends Document {
    status: WhiteLabelStatus;
    /** The branding currently rendered on reports (only when status === 'approved'). */
    live: WhiteLabelBranding | null;
    /** The branding awaiting / last submitted for review. */
    pending: WhiteLabelBranding | null;
    submittedBy?: string;
    submittedAt?: Date;
    reviewedBy?: string;
    reviewedAt?: Date;
    reviewNote?: string;
    createdAt: Date;
    updatedAt: Date;
}

const BrandingSchema = new Schema<WhiteLabelBranding>(
    {
        companyName: { type: String, required: true, trim: true },
        logoUrl: { type: String, trim: true },
        primaryColor: { type: String, trim: true },
        accentColor: { type: String, trim: true },
        supportEmail: { type: String, trim: true },
        footerText: { type: String, trim: true },
        customDomain: { type: String, trim: true },
    },
    { _id: false }
);

const WhiteLabelProfileSchema = new Schema<IWhiteLabelProfile>(
    {
        status: {
            type: String,
            enum: ['draft', 'pending', 'approved', 'rejected'],
            default: 'draft',
            index: true,
        },
        live: {
            type: BrandingSchema,
            default: null,
        },
        pending: {
            type: BrandingSchema,
            default: null,
        },
        submittedBy: { type: String, default: null },
        submittedAt: { type: Date, default: null },
        reviewedBy: { type: String, default: null },
        reviewedAt: { type: Date, default: null },
        reviewNote: { type: String, trim: true, default: null },
    },
    {
        timestamps: true,
        collection: 'white_label_profiles',
    }
);

// Super-admin pending queue listing.
WhiteLabelProfileSchema.index({ status: 1, submittedAt: -1 });

// Prevent model recompilation in development / HMR.
const WhiteLabelProfile: Model<IWhiteLabelProfile> =
    mongoose.models.WhiteLabelProfile ||
    mongoose.model<IWhiteLabelProfile>('WhiteLabelProfile', WhiteLabelProfileSchema);

export default WhiteLabelProfile;
