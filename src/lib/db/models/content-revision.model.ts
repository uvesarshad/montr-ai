import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Content revision (Epic 8) — polymorphic, immutable snapshot of a draft or a
 * scheduled post taken on every content edit. Mirrors the version-number pattern
 * of `doc-version.model.ts` / `canvas-version.model.ts` and the changes-summary
 * intent of `crm/audit-log.model.ts`.
 *
 * Always-on (no plan gate) and best-effort: the repository capture call is
 * wrapped in try/catch by callers so a failed snapshot never fails the edit.
 *
 * Revisions are immutable, so there is no `updatedAt` — only `createdAt`.
 */

export type RevisionSubjectType = 'draft' | 'scheduled_post';

export type RevisionChangeType =
    | 'created'
    | 'content_edit'
    | 'media_edit'
    | 'platform_edit'
    | 'schedule_edit';

export interface IContentRevision extends Document {
    subjectType: RevisionSubjectType;
    subjectId: string;
    brandId: string;
    version: number;

    // Snapshot of the subject at this version
    content: string;
    mediaUrls?: string[];
    platformsSummary?: string[];
    title?: string;

    // Who/what
    editedBy: string;
    editedByName?: string;
    changeType: RevisionChangeType;
    changeSummary?: string;

    createdAt: Date;
}

const ContentRevisionSchema = new Schema<IContentRevision>(
    {
        subjectType: {
            type: String,
            enum: ['draft', 'scheduled_post'],
            required: true,
        },
        subjectId: {
            type: String,
            required: true,
        },
        brandId: {
            type: String,
            required: true,
            index: true,
        },
        version: {
            type: Number,
            required: true,
        },
        content: {
            type: String,
            default: '',
        },
        mediaUrls: {
            type: [String],
            default: undefined,
        },
        platformsSummary: {
            type: [String],
            default: undefined,
        },
        title: {
            type: String,
            default: null,
        },
        editedBy: {
            type: String,
            required: true,
        },
        editedByName: {
            type: String,
            default: null,
        },
        changeType: {
            type: String,
            enum: ['created', 'content_edit', 'media_edit', 'platform_edit', 'schedule_edit'],
            required: true,
        },
        changeSummary: {
            type: String,
            default: null,
        },
    },
    {
        // Revisions are immutable — only track createdAt.
        timestamps: { createdAt: true, updatedAt: false },
        collection: 'content_revisions',
    }
);

// Primary access pattern: list versions for a subject, newest first.
ContentRevisionSchema.index({ subjectType: 1, subjectId: 1, version: -1 });

// Optional retention — auto-delete after 365 days (mirrors crm audit-log TTL).
ContentRevisionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

// Prevent model recompilation in development while allowing schema evolution.
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.ContentRevision) {
        delete mongoose.models.ContentRevision;
    }
}

const ContentRevision: Model<IContentRevision> =
    mongoose.models.ContentRevision ||
    mongoose.model<IContentRevision>('ContentRevision', ContentRevisionSchema);

export default ContentRevision;
