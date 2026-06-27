import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Inbox Label Model
 * Manages conversation labels/tags for organization
 */
export interface IInboxLabel extends Document {
    name: string;
    color: string; // Hex color code
    description?: string;
    createdById: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const InboxLabelSchema = new Schema<IInboxLabel>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        color: {
            type: String,
            required: true,
            default: '#3B82F6',
        },
        description: {
            type: String,
            trim: true,
        },
        createdById: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// Indexes
InboxLabelSchema.index({ name: 1 }, { unique: true });

const InboxLabel = mongoose.models.InboxLabel || mongoose.model<IInboxLabel>('InboxLabel', InboxLabelSchema);

export default InboxLabel;
