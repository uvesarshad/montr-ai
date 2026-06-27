import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IFolder extends Document {
    userId: string;
    name: string;
    parentId?: string; // ObjectId as string for nesting

    // Module Integration
    referenceId?: string;
    referenceType?: string; // e.g., 'PROJECT', 'WORKFLOW'

    // Public Publishing
    isPublished: boolean;
    publishedSlug?: string;
    publishedUsername?: string;

    createdAt: Date;
    updatedAt: Date;
}

const FolderSchema = new Schema<IFolder>(
    {
        userId: {
            type: String,
            required: true,
            index: true,
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
        referenceId: {
            type: String,
            default: null,
            index: true,
        },
        referenceType: {
            type: String,
            default: null,
        },
        isPublished: {
            type: Boolean,
            default: false,
            index: true,
        },
        // No default — `default: null` + unique+sparse broke folder creation
        // (2026-06-06): sparse indexes still index EXISTING null values, so
        // every second folder with publishedSlug: null collided on E11000.
        // Uniqueness is enforced by the partial index below (strings only).
        publishedSlug: {
            type: String,
        },
        publishedUsername: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'folders',
    }
);

// Indexes
FolderSchema.index({ userId: 1, parentId: 1 });
FolderSchema.index({ userId: 1, updatedAt: -1 });
FolderSchema.index({ updatedAt: -1 });
// Unique only for real slugs — null/missing values are excluded (see field note).
FolderSchema.index(
    { publishedSlug: 1 },
    { unique: true, partialFilterExpression: { publishedSlug: { $type: 'string' } } },
);

// Prevent model recompilation in development
const FolderModel: Model<IFolder> = mongoose.models.Folder || mongoose.model<IFolder>('Folder', FolderSchema);

export default FolderModel;
