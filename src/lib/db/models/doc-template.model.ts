import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDocTemplate extends Document {
    title: string;
    description: string;
    icon: 'FileText' | 'PenSquare' | 'Compass' | 'Mail';
    content: string; // JSON structure of the document (Tiptap JSON)
    settings: {
        coverImage?: string;
    };
    isActive: boolean;
    sortOrder: number;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const DocTemplateSchema = new Schema<IDocTemplate>(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: true,
        },
        icon: {
            type: String,
            enum: ['FileText', 'PenSquare', 'Compass', 'Mail'],
            default: 'FileText',
        },
        content: {
            type: String, // Stringified JSON
            required: true,
        },
        settings: {
            coverImage: { type: String },
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        sortOrder: {
            type: Number,
            default: 0,
            index: true,
        },
        createdBy: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
        collection: 'doc_templates',
    }
);

// Prevent model recompilation in development
const DocTemplateModel: Model<IDocTemplate> = mongoose.models.DocTemplate || mongoose.model<IDocTemplate>('DocTemplate', DocTemplateSchema);

export default DocTemplateModel;
