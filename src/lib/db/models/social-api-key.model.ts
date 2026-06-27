import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISocialApiKey extends Document {
    createdByUserId: string;
    name: string;
    keyPrefix: string;                // First 8 chars, shown in UI
    keyHash: string;                  // sha256 of full key — NEVER store plaintext
    scopes: string[];                 // e.g. ['posts:read', 'posts:write']
    lastUsedAt?: Date;
    revoked: boolean;
    expiresAt?: Date;

    createdAt: Date;
    updatedAt: Date;
}

const SocialApiKeySchema = new Schema<ISocialApiKey>(
    {
        createdByUserId: {
            type: String,
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        keyPrefix: {
            type: String,
            required: true,
        },
        keyHash: {
            type: String,
            required: true,
        },
        scopes: {
            type: [String],
            default: [],
        },
        lastUsedAt: {
            type: Date,
            default: null,
        },
        revoked: {
            type: Boolean,
            default: false,
        },
        expiresAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'social_api_keys',
    }
);

// Indexes
SocialApiKeySchema.index({ keyHash: 1 }, { unique: true });
SocialApiKeySchema.index({ revoked: 1 });

const SocialApiKey: Model<ISocialApiKey> =
    mongoose.models.SocialApiKey ||
    mongoose.model<ISocialApiKey>('SocialApiKey', SocialApiKeySchema);

export default SocialApiKey;
