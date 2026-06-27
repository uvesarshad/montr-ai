import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IInboxMember extends Document {
    channelId: Types.ObjectId; // → InboxChannel
    userId: Types.ObjectId; // → User
    role: 'agent' | 'admin';
    createdAt: Date;
    updatedAt: Date;
}

const InboxMemberSchema = new Schema<IInboxMember>(
    {
        channelId: {
            type: Schema.Types.ObjectId,
            ref: 'InboxChannel',
            required: true,
            index: true,
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        role: {
            type: String,
            enum: ['agent', 'admin'],
            default: 'agent',
        },
    },
    {
        timestamps: true,
        collection: 'inbox_members',
    }
);

// Indexes
InboxMemberSchema.index({ channelId: 1, userId: 1 }, { unique: true });
InboxMemberSchema.index({ userId: 1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.InboxMember) {
        delete mongoose.models.InboxMember;
    }
}

const InboxMember =
    mongoose.models.InboxMember || mongoose.model<IInboxMember>('InboxMember', InboxMemberSchema);

export default InboxMember;
