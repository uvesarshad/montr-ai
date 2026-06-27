import mongoose, { Schema, Document, Model } from 'mongoose';



export interface IDocument extends Document {
    userId: string;
    title: string;
    content: string; // TipTap JSON or HTML
    isPublished: boolean;
    publishedUrl?: string; // Deprecated in favor of dynamic slug generation, but kept for compat
    publishedSlug?: string; // New field for clean URLs
    publishedUsername?: string;

    // Organization
    folderId?: string; // ObjectId as string

    // Module Integration
    referenceId?: string;
    referenceType?: string;

    // Security
    isPasswordProtected?: boolean;
    password?: string;

    coverImage?: string; // S3 URL
    createdAt: Date;
    updatedAt: Date;
}

const DocumentSchema = new Schema<IDocument>(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
            default: 'Untitled Document',
        },
        content: {
            type: String,
            default: '',
        },
        isPublished: {
            type: Boolean,
            default: false,
            index: true,
        },
        publishedUrl: {
            type: String,
            default: null,
        },
        publishedSlug: {
            type: String,
            unique: true,
            sparse: true,
        },
        publishedUsername: {
            type: String,
            default: null,
            index: true,
        },
        folderId: {
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
        isPasswordProtected: {
            type: Boolean,
            default: false,
        },
        password: {
            type: String,
            select: false, // Don't return by default
        },
        coverImage: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'documents',
    }
);

// Indexes
DocumentSchema.index({ userId: 1, createdAt: -1 });
DocumentSchema.index({ userId: 1, updatedAt: -1 });
DocumentSchema.index({ isPublished: 1, publishedUsername: 1 });
DocumentSchema.index({ updatedAt: -1 });

// Prevent model recompilation in development
const DocumentModel: Model<IDocument> = mongoose.models.Document || mongoose.model<IDocument>('Document', DocumentSchema);

export default DocumentModel;
