import mongoose, { Schema, Document, Model } from 'mongoose';

export type SocialInteractionType =
    | 'dm'
    | 'comment'
    | 'mention'
    | 'reaction'
    | 'follow';

export type SocialInteractionStatus = 'unread' | 'read' | 'archived';

export interface ISocialInteraction extends Document {
    brandId: string;
    accountId: string;                 // The connected social account
    platform: string;
    type: SocialInteractionType;
    externalId: string;                // Platform's id for the interaction (dedupe)
    conversationId?: string;           // Thread grouping
    parentExternalId?: string;         // For comment trees
    authorHandle: string;
    authorDisplayName?: string;
    authorAvatarUrl?: string;
    authorPlatformId?: string;
    text?: string;
    mediaUrls?: string[];
    permalink?: string;
    contactId?: string;                // Resolved CRM contact
    status: SocialInteractionStatus;
    repliedAt?: Date;
    assignedToUserId?: string;
    occurredAt: Date;
    raw?: Record<string, unknown>;

    createdAt: Date;
    updatedAt: Date;
}

const SocialInteractionSchema = new Schema<ISocialInteraction>(
    {
        brandId: {
            type: String,
            required: true,
            index: true,
        },
        accountId: {
            type: String,
            required: true,
            index: true,
        },
        platform: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            enum: ['dm', 'comment', 'mention', 'reaction', 'follow'],
            required: true,
        },
        externalId: {
            type: String,
            required: true,
        },
        conversationId: {
            type: String,
            default: null,
        },
        parentExternalId: {
            type: String,
            default: null,
        },
        authorHandle: {
            type: String,
            required: true,
        },
        authorDisplayName: {
            type: String,
            default: null,
        },
        authorAvatarUrl: {
            type: String,
            default: null,
        },
        authorPlatformId: {
            type: String,
            default: null,
        },
        text: {
            type: String,
            default: null,
        },
        mediaUrls: {
            type: [String],
            default: undefined,
        },
        permalink: {
            type: String,
            default: null,
        },
        contactId: {
            type: String,
            default: null,
            index: true,
        },
        status: {
            type: String,
            enum: ['unread', 'read', 'archived'],
            default: 'unread',
            index: true,
        },
        repliedAt: {
            type: Date,
            default: null,
        },
        assignedToUserId: {
            type: String,
            default: null,
        },
        occurredAt: {
            type: Date,
            required: true,
        },
        raw: {
            type: Schema.Types.Mixed,
            default: undefined,
        },
    },
    {
        timestamps: true,
        collection: 'social_interactions',
    }
);

// Indexes
SocialInteractionSchema.index({ brandId: 1, status: 1, occurredAt: -1 });
SocialInteractionSchema.index({ accountId: 1, externalId: 1 }, { unique: true }); // Dedupe
SocialInteractionSchema.index({ platform: 1, conversationId: 1 });

const SocialInteraction: Model<ISocialInteraction> =
    mongoose.models.SocialInteraction ||
    mongoose.model<ISocialInteraction>('SocialInteraction', SocialInteractionSchema);

export default SocialInteraction;
