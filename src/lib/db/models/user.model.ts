import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUserCustomLimits {
    allowedModelTiers?: ('free' | 'pro' | 'enterprise')[];
    allowedModelTypes?: ('text' | 'image' | 'video')[];
    monthlyCredits?: number;
    disabledModels?: string[];
    enabledModels?: string[];
    byokProviders?: string[];
}

export interface IUser extends Document {


    // Authentication fields
    email?: string;
    // BetterAuth owns this as a boolean (was a Date under NextAuth).
    emailVerified?: boolean;
    /** @deprecated BetterAuth stores credentials in the `accounts` collection. */
    hashedPassword?: string;
    phoneNumber?: string;
    phoneVerified?: Date;
    // 2FA (TOTP) — @deprecated: owned by the BetterAuth twoFactor plugin (`twoFactor` collection).
    twoFactorSecret?: string;
    twoFactorEnabled?: boolean;
    twoFactorBackupCodes?: string[];

    // OAuth accounts — @deprecated embedded array; BetterAuth uses the `accounts` collection.
    accounts: Array<{
        provider: 'google' | 'email' | 'whatsapp' | 'credentials';
        providerAccountId: string;
        type: 'oauth' | 'email' | 'credentials';
    }>;

    // Profile
    name: string;
    firstName?: string;
    lastName?: string;
    image?: string;
    username?: string;
    bio?: string;
    company?: string;
    billingAddress?: {
        street?: string;
        city?: string;
        state?: string;
        zip?: string;
        country?: string;
    };
    role: 'user' | 'admin' | 'super_admin';

    // Organization
    // CRM RBAC role assignment (nullable; null = legacy full-access behavior)
    crmRoleId?: mongoose.Types.ObjectId | null;

    // Subscription Plan
    planId?: string;

    // Custom limits (per-user overrides)
    customLimits?: IUserCustomLimits;

    // Subscription tracking
    razorpaySubscriptionId?: string;
    subscriptionStatus?: 'active' | 'past_due' | 'cancelled' | 'halted' | 'completed';
    currentPeriodEnd?: Date;
    cancelAtPeriodEnd?: boolean;

    // BYOK
    canUseOwnApiKeys?: boolean;
    userApiKeys?: Record<string, string>;
    openaiApiKey?: string;
    anthropicApiKey?: string;
    googleApiKey?: string;
    xaiApiKey?: string;
    deepseekApiKey?: string;
    mistralApiKey?: string;
    cohereApiKey?: string;
    groqApiKey?: string;
    perplexityApiKey?: string;
    falApiKey?: string;
    openrouterApiKey?: string;

    // Migration compatibility
    firebaseUid?: string; // Preserve Firebase UID for migration

    // AI Preferences
    aiPreferences?: Map<string, { modelId: string; providerId: string }>;

    // Onboarding
    hasSeenOnboarding?: boolean;

    // Timestamps
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
    {
        email: {
            type: String,
            unique: true,
            sparse: true, // Allow null for phone-only users
            lowercase: true,
            trim: true,
        },
        // BetterAuth writes this as a boolean (was Date under NextAuth).
        emailVerified: {
            type: Boolean,
            default: false,
        },
        hashedPassword: {
            type: String,
            select: false, // Don't include in queries by default
        },
        phoneNumber: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
        },
        phoneVerified: {
            type: Date,
            default: null,
        },
        twoFactorSecret: {
            type: String,
            select: false,
        },
        twoFactorEnabled: {
            type: Boolean,
            default: false,
        },
        twoFactorBackupCodes: {
            type: [String],
            select: false,
            default: [],
        },
        accounts: [
            {
                provider: {
                    type: String,
                    enum: ['google', 'email', 'whatsapp', 'credentials'],
                    required: true,
                },
                providerAccountId: {
                    type: String,
                    required: true,
                },
                type: {
                    type: String,
                    enum: ['oauth', 'email', 'credentials'],
                    required: true,
                },
            },
        ],
        name: {
            type: String,
            required: true,
            trim: true,
        },
        firstName: {
            type: String,
            trim: true,
        },
        lastName: {
            type: String,
            trim: true,
        },
        image: {
            type: String,
            default: null,
        },
        username: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
            lowercase: true,
        },
        bio: {
            type: String,
            trim: true,
        },
        company: {
            type: String,
            trim: true,
        },
        billingAddress: {
            street: {
                type: String,
                trim: true,
            },
            city: {
                type: String,
                trim: true,
            },
            state: {
                type: String,
                trim: true,
            },
            zip: {
                type: String,
                trim: true,
            },
            country: {
                type: String,
                trim: true,
            },
        },
        role: {
            type: String,
            enum: ['user', 'admin', 'super_admin'],
            default: 'user',
        },
        crmRoleId: {
            type: Schema.Types.ObjectId,
            ref: 'CrmRole',
            default: null,
        },
        planId: {
            type: String,
            default: null,
        },
        razorpaySubscriptionId: {
            type: String,
            default: null,
        },
        subscriptionStatus: {
            type: String,
            enum: ['active', 'past_due', 'cancelled', 'halted', 'completed'],
            default: null,
        },
        currentPeriodEnd: {
            type: Date,
            default: null,
        },
        cancelAtPeriodEnd: {
            type: Boolean,
            default: false,
        },
        customLimits: {
            allowedModelTiers: {
                type: [String],
                enum: ['free', 'pro', 'enterprise'],
                default: undefined,
            },
            allowedModelTypes: {
                type: [String],
                enum: ['text', 'image', 'video'],
                default: undefined,
            },
            monthlyCredits: {
                type: Number,
                default: undefined,
            },
            disabledModels: {
                type: [String],
                default: undefined,
            },
            enabledModels: {
                type: [String],
                default: undefined,
            },
            byokProviders: {
                type: [String],
                default: undefined,
            },
        },
        canUseOwnApiKeys: {
            type: Boolean,
            default: false,
        },
        userApiKeys: {
            type: Schema.Types.Mixed,
            default: {},
        },
        firebaseUid: {
            type: String,
            unique: true,
            sparse: true,
            index: true,
        },
        aiPreferences: {
            type: Map,
            of: new Schema({
                modelId: { type: String, required: true },
                providerId: { type: String, required: true }
            }, { _id: false }),
            default: {}
        },
        hasSeenOnboarding: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        collection: 'users',
    }
);

// Indexes
// Prevent model recompilation in development, BUT allow it if we need schema updates
// In dev, we sometimes need to force it.

// Check if we need to delete the model to pick up new schema changes
// This is a common pattern in Next.js with Mongoose to handle HMR
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.User) {
        delete mongoose.models.User;
    }
}

const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
