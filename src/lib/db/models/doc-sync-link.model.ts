import mongoose, { Schema, Document, Model } from 'mongoose';

export type DocSyncDirection = 'pull' | 'push' | 'two_way';
export type DocSyncStatus = 'idle' | 'syncing' | 'error';

/**
 * Links a MontrAI document to an external page (Notion for now) for syncing.
 *
 * - pull:    Notion → MontrAI (Notion is the source of truth)
 * - push:    MontrAI → Notion (the doc is the source of truth)
 * - two_way: last writer wins; the losing side is snapshotted to DocVersion
 *            before being overwritten.
 */
export interface IDocSyncLink extends Document {
    documentId: string;
    /** User who created the link — sync runs with their connection. */
    userId: string;
    provider: 'notion';
    /** SocialAccount _id holding the encrypted Notion access token. */
    socialAccountId: string;

    externalId: string; // Notion page id
    externalUrl?: string;
    externalTitle?: string;

    direction: DocSyncDirection;

    lastSyncedAt?: Date | null;
    /** Notion's last_edited_time at the moment of the last successful sync. */
    externalLastEditedAt?: Date | null;
    /** Document.updatedAt at the moment of the last successful sync. */
    localUpdatedAt?: Date | null;

    syncStatus: DocSyncStatus;
    lastError?: string | null;

    createdAt: Date;
    updatedAt: Date;
}

const DocSyncLinkSchema = new Schema<IDocSyncLink>(
    {
        documentId: {
            type: String,
            required: true,
            index: true,
        },
        userId: {
            type: String,
            required: true,
        },
        provider: {
            type: String,
            enum: ['notion'],
            default: 'notion',
        },
        socialAccountId: {
            type: String,
            required: true,
        },
        externalId: {
            type: String,
            required: true,
        },
        externalUrl: {
            type: String,
            default: null,
        },
        externalTitle: {
            type: String,
            default: null,
        },
        direction: {
            type: String,
            enum: ['pull', 'push', 'two_way'],
            default: 'pull',
        },
        lastSyncedAt: {
            type: Date,
            default: null,
        },
        externalLastEditedAt: {
            type: Date,
            default: null,
        },
        localUpdatedAt: {
            type: Date,
            default: null,
        },
        syncStatus: {
            type: String,
            enum: ['idle', 'syncing', 'error'],
            default: 'idle',
        },
        lastError: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'doc_sync_links',
    }
);

// One link per document (a doc syncs with at most one Notion page).
DocSyncLinkSchema.index({ documentId: 1 }, { unique: true });
DocSyncLinkSchema.index({ provider: 1 });
// The cron job scans all links — keep a lean covering index.
DocSyncLinkSchema.index({ provider: 1, syncStatus: 1 });

const DocSyncLink: Model<IDocSyncLink> =
    mongoose.models.DocSyncLink || mongoose.model<IDocSyncLink>('DocSyncLink', DocSyncLinkSchema);

export default DocSyncLink;
