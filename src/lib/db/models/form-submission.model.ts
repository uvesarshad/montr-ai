import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IFormSubmission extends Document {
    formId: mongoose.Types.ObjectId;
    /** Agency-mode brand scope (B3-4.6.1). Denormalized from the parent form. */
    brandId?: string | null;
    /** Resolved CRM contact (B3-4.5.1 X2 integration). Nullable until the resolver creates/finds one. */
    contactId?: mongoose.Types.ObjectId | null;
    data: Record<string, unknown>; // Key-value pairs of answers
    metadata: {
        ip?: string;
        userAgent?: string;
        submittedAt: Date;
    };
    createdAt: Date;
    updatedAt: Date;
}

const FormSubmissionSchema = new Schema<IFormSubmission>(
    {
        formId: {
            type: Schema.Types.ObjectId,
            ref: 'Form',
            required: true,
            index: true,
        },
        brandId: {
            type: String,
            default: null,
            index: true,
        },
        contactId: {
            type: Schema.Types.ObjectId,
            ref: 'CrmContact',
            default: null,
            index: true,
        },
        data: {
            type: Schema.Types.Mixed,
            required: true,
        },
        metadata: {
            ip: { type: String },
            userAgent: { type: String },
            submittedAt: { type: Date, default: Date.now },
        },
    },
    {
        timestamps: true,
        collection: 'form_submissions',
    }
);

// Indexes
FormSubmissionSchema.index({ formId: 1, createdAt: -1 });
FormSubmissionSchema.index({ createdAt: -1 });

// Prevent model recompilation in development
const FormSubmissionModel: Model<IFormSubmission> = mongoose.models.FormSubmission || mongoose.model<IFormSubmission>('FormSubmission', FormSubmissionSchema);

export default FormSubmissionModel;
