import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Org-wide social approval policy (audit C8 2026-06-06).
 * Set by the org admin (gated by the plan's `allowApprovalWorkflow` feature).
 * The org policy is the floor — a brand's `BrandContext.requireApproval` may
 * additionally require approval but cannot weaken the org policy.
 */
export interface IOrgSocialApprovalPolicy {
    enabled: boolean;
    /** Who needs approval: every member, or only non-admins (admins auto-approve). */
    appliesTo: 'all_members' | 'non_admins';
    /** Which intents require approval. */
    requireFor: ('schedule' | 'publish')[];
}

export interface IOrganization extends Document {
    name: string;
    email?: string; // Organization's contact email
    adminId: string; // User ID of the organization admin
    subscriptionPlanId?: string;
    memberLimit: number;
    allowedEmailDomains: string[];
    members: string[]; // Array of User IDs
    status: 'active' | 'inactive' | 'suspended';
    socialApprovalPolicy?: IOrgSocialApprovalPolicy;
    createdAt: Date;
    updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        email: {
            type: String,
            trim: true,
            lowercase: true,
            default: null,
        },
        adminId: {
            type: String,
            required: true,
            index: true,
        },
        subscriptionPlanId: {
            type: String,
            default: null,
        },
        memberLimit: {
            type: Number,
            default: 5,
        },
        allowedEmailDomains: {
            type: [String],
            default: [],
        },
        members: {
            type: [String],
            default: [],
        },
        status: {
            type: String,
            enum: ['active', 'inactive', 'suspended'],
            default: 'active',
        },
        // Org-wide social approval policy (audit C8). Existing orgs default to
        // disabled — no behavior change until an org admin turns it on.
        socialApprovalPolicy: {
            type: new Schema<IOrgSocialApprovalPolicy>({
                enabled: { type: Boolean, default: false },
                appliesTo: {
                    type: String,
                    enum: ['all_members', 'non_admins'],
                    default: 'non_admins',
                },
                requireFor: {
                    type: [String],
                    enum: ['schedule', 'publish'],
                    default: ['schedule', 'publish'],
                },
            }, { _id: false }),
            default: () => ({ enabled: false, appliesTo: 'non_admins', requireFor: ['schedule', 'publish'] }),
        },
    },
    {
        timestamps: true,
        collection: 'organizations',
    }
);

// Indexes

OrganizationSchema.index({ status: 1 });

// Force re-registration during development to pick up schema changes
if (mongoose.models.Organization) {
    delete mongoose.models.Organization;
}

const Organization: Model<IOrganization> = mongoose.model<IOrganization>('Organization', OrganizationSchema);

export default Organization;
