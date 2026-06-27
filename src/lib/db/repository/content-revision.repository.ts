import { connectDB } from '@/lib/mongodb';
import ContentRevision, {
    IContentRevision,
    RevisionSubjectType,
    RevisionChangeType,
} from '../models/content-revision.model';

/**
 * Content-revision repository (Epic 8).
 *
 * `record()` auto-increments the version per subject (max existing + 1) and
 * persists an immutable snapshot. Callers wrap the call in try/catch so a
 * failed snapshot never fails the underlying edit — revision capture is
 * always-on but strictly best-effort.
 */

export interface RecordRevisionInput {
    subjectType: RevisionSubjectType;
    subjectId: string;
    brandId: string;
    content: string;
    mediaUrls?: string[];
    platformsSummary?: string[];
    title?: string | null;
    editedBy: string;
    editedByName?: string | null;
    changeType: RevisionChangeType;
    changeSummary?: string | null;
}

class ContentRevisionRepository {
    /**
     * Persist a new revision, auto-incrementing the version for this subject.
     * Returns the saved revision.
     */
    async record(input: RecordRevisionInput): Promise<IContentRevision> {
        await connectDB();

        // Find the current max version for this subject (newest first via index).
        const latest = await ContentRevision.findOne({
            subjectType: input.subjectType,
            subjectId: input.subjectId,
        })
            .sort({ version: -1 })
            .select('version')
            .lean<{ version: number } | null>();

        const nextVersion = (latest?.version ?? 0) + 1;

        const revision = new ContentRevision({
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            brandId: input.brandId,
            version: nextVersion,
            content: input.content ?? '',
            mediaUrls: input.mediaUrls,
            platformsSummary: input.platformsSummary,
            title: input.title ?? null,
            editedBy: input.editedBy,
            editedByName: input.editedByName ?? null,
            changeType: input.changeType,
            changeSummary: input.changeSummary ?? null,
        });

        return revision.save();
    }

    /**
     * List revisions for a subject, newest first.
     */
    async list(
        subjectType: RevisionSubjectType,
        subjectId: string,
        limit: number = 50,
    ): Promise<IContentRevision[]> {
        await connectDB();
        return ContentRevision.find({ subjectType, subjectId })
            .sort({ version: -1 })
            .limit(limit)
            .exec();
    }

    /**
     * Fetch one specific version of a subject.
     */
    async getVersion(
        subjectType: RevisionSubjectType,
        subjectId: string,
        version: number,
    ): Promise<IContentRevision | null> {
        await connectDB();
        return ContentRevision.findOne({ subjectType, subjectId, version }).exec();
    }

    /**
     * Count revisions captured for a subject.
     */
    async countForSubject(
        subjectType: RevisionSubjectType,
        subjectId: string,
    ): Promise<number> {
        await connectDB();
        return ContentRevision.countDocuments({ subjectType, subjectId }).exec();
    }
}

export const contentRevisionRepository = new ContentRevisionRepository();
