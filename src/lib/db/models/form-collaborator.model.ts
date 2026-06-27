import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IFormCollaborator extends Document {
    formId: string;
    userId?: string;
    email?: string;
    role: 'viewer' | 'editor';
    invitedBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const FormCollaboratorSchema = new Schema<IFormCollaborator>(
    {
        formId: {
            type: String,
            required: true,
            index: true,
        },
        userId: {
            type: String,
            default: null,
            index: true,
        },
        email: {
            type: String,
            default: null,
            trim: true,
            lowercase: true,
        },
        role: {
            type: String,
            enum: ['viewer', 'editor'],
            default: 'viewer',
        },
        invitedBy: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
        collection: 'form_collaborators',
    }
);

FormCollaboratorSchema.index({ formId: 1, userId: 1 });
FormCollaboratorSchema.index({ formId: 1, email: 1 });

const FormCollaboratorModel: Model<IFormCollaborator> =
    mongoose.models.FormCollaborator ||
    mongoose.model<IFormCollaborator>('FormCollaborator', FormCollaboratorSchema);

export default FormCollaboratorModel;
