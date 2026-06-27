import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IForm extends Document {
    userId: string;
    /** Agency-mode brand scope (B3-4.6.1). Form submissions inherit this on intake. */
    brandId?: string | null;
    title: string;
    content: string; // JSON structure of the form (Tiptap JSON)
    isPublished: boolean;
    slug: string;
    views: number;
    submissionsCount: number;
    linkedDocId?: string;
    isPasswordProtected?: boolean;
    password?: string;
    settings: {
        theme?: string;
        emailNotifications?: boolean;
        notificationEmail?: string;
        description?: string;
        submitButtonText?: string;
        thankYouMessage?: string;
        thankYouUrl?: string;
        crmIntegration?: {
            enabled: boolean;
            fieldMap: {
                firstName?: string;
                lastName?: string;
                email?: string;
                phone?: string;
                company?: string;
                jobTitle?: string;
            };
        };
    };
    createdAt: Date;
    updatedAt: Date;
}

const FormSchema = new Schema<IForm>(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        brandId: {
            type: String,
            default: null,
            index: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
            default: 'Untitled Form',
        },
        content: {
            type: String,
            default: '', // Will store JSON string
        },
        isPublished: {
            type: Boolean,
            default: false,
            index: true,
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        views: {
            type: Number,
            default: 0,
        },
        submissionsCount: {
            type: Number,
            default: 0,
        },
        linkedDocId: {
            type: String,
            default: null,
            index: true,
        },
        isPasswordProtected: {
            type: Boolean,
            default: false,
        },
        password: {
            type: String,
            select: false,
        },
        settings: {
            theme: { type: String, default: 'default' },
            emailNotifications: { type: Boolean, default: false },
            notificationEmail: { type: String },
            description: { type: String },
            submitButtonText: { type: String, default: 'Submit' },
            thankYouMessage: { type: String, default: 'Thank you for your submission!' },
            thankYouUrl: { type: String },
            crmIntegration: {
                enabled: { type: Boolean, default: false },
                fieldMap: {
                    firstName: { type: String },
                    lastName: { type: String },
                    email: { type: String },
                    phone: { type: String },
                    company: { type: String },
                    jobTitle: { type: String },
                },
            },
        },
    },
    {
        timestamps: true,
        collection: 'forms',
    }
);

// Indexes
FormSchema.index({ userId: 1, createdAt: -1 });
FormSchema.index({ createdAt: -1 });

// Prevent model recompilation in development
const FormModel: Model<IForm> = mongoose.models.Form || mongoose.model<IForm>('Form', FormSchema);

export default FormModel;
