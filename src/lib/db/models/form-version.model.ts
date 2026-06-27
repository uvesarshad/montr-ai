import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IFormVersion extends Document {
    formId: string;
    version: number;
    content: string; // Full form content snapshot (Tiptap JSON)
    title: string; // Form title at this version
    createdBy: string; // User ID who created this version
    createdAt: Date;
    isAutoSave: boolean; // Auto-save vs manual save
    changeDescription?: string; // Optional description of changes
}

const FormVersionSchema = new Schema<IFormVersion>(
    {
        formId: {
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
            required: true, // Snapshot of form content
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
        },
    },
    {
        timestamps: { createdAt: true, updatedAt: false }, // Only track creation
        collection: 'form_versions',
    }
);

// Indexes
FormVersionSchema.index({ formId: 1, version: -1 }); // Get versions for a form, newest first
FormVersionSchema.index({ formId: 1, createdAt: -1 }); // Time-based queries

// Compound unique index to prevent duplicate versions
FormVersionSchema.index({ formId: 1, version: 1 }, { unique: true });

// Prevent model recompilation in development
const FormVersionModel: Model<IFormVersion> =
    mongoose.models.FormVersion || mongoose.model<IFormVersion>('FormVersion', FormVersionSchema);

export default FormVersionModel;
