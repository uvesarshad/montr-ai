import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDocVersion extends Document {
    docId: string;
    version: number;
    content: string; // Full document content snapshot (Tiptap JSON/HTML)
    title: string; // Document title at this version
    createdBy: string; // User ID who created this version
    createdAt: Date;
    isAutoSave: boolean; // Auto-save vs manual save
    changeDescription?: string; // Optional description of changes
}

const DocVersionSchema = new Schema<IDocVersion>(
    {
        docId: {
            type: String,
            required: true,
            index: true,
        },
        version: {
            type: Number,
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
        title: {
            type: String,
            required: true,
        },
        createdBy: {
            type: String,
            required: true,
        },
        isAutoSave: {
            type: Boolean,
            default: false,
        },
        changeDescription: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'doc_versions',
    }
);

// Indexes
DocVersionSchema.index({ docId: 1, version: -1 }); // Get versions for a doc, newest first
DocVersionSchema.index({ docId: 1, createdAt: -1 }); // Time-based queries

// Compound index to ensure unique versions per doc
DocVersionSchema.index({ docId: 1, version: 1 }, { unique: true });

// Prevent model recompilation in development
const DocVersionModel: Model<IDocVersion> = mongoose.models.DocVersion || mongoose.model<IDocVersion>('DocVersion', DocVersionSchema);

export default DocVersionModel;
