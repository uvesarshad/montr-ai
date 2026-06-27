import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDocCollaborator extends Document {
    resourceId: string; // Document or Folder ID
    resourceType: 'document' | 'folder';

    userId?: string; // Internal User ID (if registered)
    email?: string; // External Email (if not registered or just invited via email)

    role: 'viewer' | 'editor';
    invitedBy: string; // User ID of the inviter

    createdAt: Date;
    updatedAt: Date;
}

const DocCollaboratorSchema = new Schema<IDocCollaborator>(
    {
        resourceId: {
            type: String,
            required: true,
            index: true,
        },
        resourceType: {
            type: String,
            enum: ['document', 'folder'],
            required: true,
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
        collection: 'doc_collaborators',
    }
);

// Indexes
DocCollaboratorSchema.index({ resourceId: 1, userId: 1 }); // Quick check for user access
DocCollaboratorSchema.index({ resourceId: 1, email: 1 }); // Quick check for email invites

// Prevent model recompilation in development
const DocCollaboratorModel: Model<IDocCollaborator> = mongoose.models.DocCollaborator || mongoose.model<IDocCollaborator>('DocCollaborator', DocCollaboratorSchema);

export default DocCollaboratorModel;
