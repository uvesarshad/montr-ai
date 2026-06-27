import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IWhatsAppAccount extends Document {
    /** Agency-mode brand scope (B3-4.6.1). */
    brandId?: Types.ObjectId | null;
    name: string; // e.g., "Sales Team"

    // Meta API Credentials
    facebookAppId: string;
    wabaId: string; // WhatsApp Business Account ID
    phoneNumberId: string;
    accessToken: string; // Encrypted
    webhookVerifyToken: string;

    // Profile
    phoneNumber: string;
    displayPhoneNumber: string;
    qualityRating?: string; // GREEN, YELLOW, RED

    /** Assigned AI bot (B3-4.5.5). Null = fall back to keyword auto-reply path. */
    aiBotId?: Types.ObjectId | null;

    // Status
    status: 'active' | 'disconnected' | 'banned' | 'restricted';
    lastSyncedAt?: Date;

    createdById: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const WhatsAppAccountSchema = new Schema<IWhatsAppAccount>(
    {
        brandId: {
            type: Schema.Types.ObjectId,
            ref: 'Brand',
            default: null,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        facebookAppId: {
            type: String,
            required: true,
        },
        wabaId: {
            type: String,
            required: true,
        },
        phoneNumberId: {
            type: String,
            required: true,
            unique: true,
        },
        accessToken: {
            type: String,
            required: true,
        },
        webhookVerifyToken: {
            type: String,
            required: true,
        },
        phoneNumber: {
            type: String,
            required: true,
        },
        displayPhoneNumber: String,
        qualityRating: String,
        aiBotId: {
            type: Schema.Types.ObjectId,
            ref: 'AiBot',
            default: null,
            index: true,
        },
        status: {
            type: String,
            enum: ['active', 'disconnected', 'banned', 'restricted'],
            default: 'active',
        },
        lastSyncedAt: Date,
        createdById: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    {
        timestamps: true,
        collection: 'whatsapp_accounts',
    }
);

// Indexes
WhatsAppAccountSchema.index({ phoneNumberId: 1 }, { unique: true });
WhatsAppAccountSchema.index({ brandId: 1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.WhatsAppAccount) {
        delete mongoose.models.WhatsAppAccount;
    }
}

const WhatsAppAccount: Model<IWhatsAppAccount> =
    mongoose.models.WhatsAppAccount || mongoose.model<IWhatsAppAccount>('WhatsAppAccount', WhatsAppAccountSchema);

export default WhatsAppAccount;
