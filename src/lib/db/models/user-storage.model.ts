import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IUserStorage extends Document {
    userId: string;
    brandId: string;
    provider: 'google-drive';
    accountEmail?: string;
    accountName?: string;
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string;
    tokenExpiresAt: Date;
    rootFolderId?: string;       // Default folder in Drive
    usedBytes: number;
    quotaBytes: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const UserStorageSchema = new Schema<IUserStorage>(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        brandId: {
            type: String,
            required: true,
            index: true,
        },
        provider: {
            type: String,
            enum: ['google-drive'],
            required: true,
        },
        accountEmail: {
            type: String,
        },
        accountName: {
            type: String,
        },
        accessTokenEncrypted: {
            type: String,
            required: true,
        },
        refreshTokenEncrypted: {
            type: String,
            required: true,
        },
        tokenExpiresAt: {
            type: Date,
            required: true,
        },
        rootFolderId: {
            type: String,
        },
        usedBytes: {
            type: Number,
            default: 0,
        },
        quotaBytes: {
            type: Number,
            default: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
        collection: 'user_storage',
    }
);

// Indexes
UserStorageSchema.index({ userId: 1, provider: 1 });
UserStorageSchema.index({ brandId: 1, provider: 1 });

const UserStorage: Model<IUserStorage> =
    mongoose.models.UserStorage || mongoose.model<IUserStorage>('UserStorage', UserStorageSchema);

export default UserStorage;
