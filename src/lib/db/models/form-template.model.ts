import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IFormTemplate extends Document {
    title: string;
    description: string;
    icon: 'Mail' | 'BarChart2' | 'FileText';
    content: string; // JSON structure of the form (Tiptap JSON)
    settings: {
        theme?: string;
        emailNotifications?: boolean;
        submitButtonText?: string;
        thankYouMessage?: string;
        thankYouUrl?: string;
    };
    isActive: boolean;
    sortOrder: number;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const FormTemplateSchema = new Schema<IFormTemplate>(
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
            enum: ['Mail', 'BarChart2', 'FileText'],
            default: 'FileText',
        },
        content: {
            type: String, // Stringified JSON
            required: true,
        },
        settings: {
            theme: { type: String, default: 'default' },
            emailNotifications: { type: Boolean, default: false },
            submitButtonText: { type: String, default: 'Submit' },
            thankYouMessage: { type: String, default: 'Thank you for your submission!' },
            thankYouUrl: { type: String },
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
        collection: 'form_templates',
    }
);

// Prevent model recompilation in development
const FormTemplateModel: Model<IFormTemplate> = mongoose.models.FormTemplate || mongoose.model<IFormTemplate>('FormTemplate', FormTemplateSchema);

export default FormTemplateModel;
