import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDraftMedia {
    id: string;
    url: string;
    type: 'image' | 'video';
}

export interface IDraftPlatformConfig {
    accountId: string;
    platform: string;
    platformUsername: string;
    telegramChatIds?: string[];
    redditSubreddit?: string;
    redditTitle?: string;
}

export interface IPostDraft extends Document {
    brandId: string;
    userId: string;
    // Content
    title: string;                      // Auto-generated from first line or "Untitled Draft"
    content: string;
    media: IDraftMedia[];

    // Selected platforms
    platforms: IDraftPlatformConfig[];

    // Metadata
    scheduleCount: number;
    lastEditedAt: Date;
    deletedAt?: Date | null;            // Soft delete (audit §D)
    createdAt: Date;
    updatedAt: Date;
}

const DraftMediaSchema = new Schema<IDraftMedia>(
    {
        id: { type: String, required: true },
        url: { type: String, required: true },
        type: { type: String, enum: ['image', 'video'], required: true },
    },
    { _id: false }
);

const DraftPlatformConfigSchema = new Schema<IDraftPlatformConfig>(
    {
        accountId: { type: String, required: true },
        platform: { type: String, required: true },
        platformUsername: { type: String, required: true },
        telegramChatIds: { type: [String], default: undefined },
        redditSubreddit: { type: String, default: null },
        redditTitle: { type: String, default: null },
    },
    { _id: false }
);

const PostDraftSchema = new Schema<IPostDraft>(
    {
        brandId: {
            type: String,
            required: true,
            index: true,
        },
        userId: {
            type: String,
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
            default: 'Untitled Draft',
        },
        content: {
            type: String,
            default: '',
        },
        media: {
            type: [DraftMediaSchema],
            default: [],
        },
        platforms: {
            type: [DraftPlatformConfigSchema],
            default: [],
        },
        scheduleCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        lastEditedAt: {
            type: Date,
            default: Date.now,
        },
        deletedAt: {
            type: Date,
            default: null,
            index: true,
        },
    },
    {
        timestamps: true,
        collection: 'post_drafts',
    }
);

// Indexes
PostDraftSchema.index({ userId: 1, lastEditedAt: -1 });
PostDraftSchema.index({ brandId: 1, lastEditedAt: -1 });
PostDraftSchema.index({ createdAt: -1 }); // Org-scoped listing (audit §6)

const existingPostDraftModel = mongoose.models.PostDraft as Model<IPostDraft> | undefined;

if (existingPostDraftModel && !existingPostDraftModel.schema.path('scheduleCount')) {
    existingPostDraftModel.schema.add({
        scheduleCount: {
            type: Number,
            default: 0,
            min: 0,
        },
    });
}

// Prevent recompilation while allowing schema evolution in dev
const PostDraft: Model<IPostDraft> =
    existingPostDraftModel || mongoose.model<IPostDraft>('PostDraft', PostDraftSchema);

export default PostDraft;
