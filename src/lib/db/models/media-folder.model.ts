import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IMediaFolder extends Document {
    brandId: string;
    userId: string;
    name: string;
    parentId?: string;              // For nested folders
    color?: string;                 // Visual distinction (hex color)
    assetCount: number;             // Cached count of assets
    createdAt: Date;
    updatedAt: Date;
}

const MediaFolderSchema = new Schema<IMediaFolder>(
    {
        brandId: {
            type: String,
            required: true,
            index: true,
        },
        userId: {
            type: String,
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        parentId: {
            type: String,
            default: null,
            index: true,
        },
        color: {
            type: String,
            default: '#6366f1', // Default indigo color
        },
        assetCount: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
        collection: 'media_folders',
    }
);

// Compound indexes
MediaFolderSchema.index({ brandId: 1, parentId: 1 });
MediaFolderSchema.index({ brandId: 1, name: 1 });

// Prevent model recompilation in development
const MediaFolder: Model<IMediaFolder> =
    mongoose.models.MediaFolder || mongoose.model<IMediaFolder>('MediaFolder', MediaFolderSchema);

export default MediaFolder;
