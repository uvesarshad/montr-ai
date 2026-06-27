import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMediaAsset extends Document {
    brandId: string;
    userId: string;
    url: string;                    // Storage URL (Firebase, Cloudinary, etc.)
    thumbnailUrl?: string;
    type: 'image' | 'video';
    filename: string;               // Stored filename
    originalName: string;           // Original uploaded filename
    mimeType: string;
    size: number;                   // bytes
    width?: number;
    height?: number;
    duration?: number;              // For videos, in seconds
    folderId?: string;              // For folder organization
    tags: string[];                 // Searchable tags
    altText?: string;               // Accessibility
    usageCount: number;             // Track reuse across posts

    // AI Studio provenance — set when the asset was produced by an AI Studio session.
    // Lets the "use in post / workflow / campaign" surfaces trace back to the
    // source prompt + settings.
    aiStudioProjectId?: string;
    aiStudioSessionId?: string;
    /** AI provider that produced the asset (anthropic / openai / runway / …). */
    sourceProvider?: string;
    /** Generation prompt — keeps context in the media library. */
    sourcePrompt?: string;

    createdAt: Date;
    updatedAt: Date;
}

const MediaAssetSchema = new Schema<IMediaAsset>(
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
        url: {
            type: String,
            required: true,
        },
        thumbnailUrl: {
            type: String,
            default: null,
        },
        type: {
            type: String,
            enum: ['image', 'video'],
            required: true,
            index: true,
        },
        filename: {
            type: String,
            required: true,
        },
        originalName: {
            type: String,
            required: true,
        },
        mimeType: {
            type: String,
            required: true,
        },
        size: {
            type: Number,
            required: true,
        },
        width: {
            type: Number,
            default: null,
        },
        height: {
            type: Number,
            default: null,
        },
        duration: {
            type: Number,
            default: null,
        },
        folderId: {
            type: String,
            default: null,
            index: true,
        },
        tags: {
            type: [String],
            default: [],
            index: true,
        },
        altText: {
            type: String,
            trim: true,
            default: null,
        },
        usageCount: {
            type: Number,
            default: 0,
        },
        aiStudioProjectId: {
            type: String,
            default: null,
            index: true,
        },
        aiStudioSessionId: {
            type: String,
            default: null,
        },
        sourceProvider: {
            type: String,
            default: null,
        },
        sourcePrompt: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'media_assets',
    }
);

// Compound indexes
MediaAssetSchema.index({ brandId: 1, createdAt: -1 });
MediaAssetSchema.index({ brandId: 1, folderId: 1 });
MediaAssetSchema.index({ brandId: 1, type: 1 });


// Text index for search
MediaAssetSchema.index({ originalName: 'text', tags: 'text', altText: 'text' });

// Prevent model recompilation in development
const MediaAsset: Model<IMediaAsset> =
    mongoose.models.MediaAsset || mongoose.model<IMediaAsset>('MediaAsset', MediaAssetSchema);

export default MediaAsset;
