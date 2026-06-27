import { connectDB } from '@/lib/mongodb';
import DocSyncLink, {
    IDocSyncLink,
    DocSyncDirection,
    DocSyncStatus,
} from '@/lib/db/models/doc-sync-link.model';

export interface CreateDocSyncLinkInput {
    documentId: string;
    userId: string;
    socialAccountId: string;
    externalId: string;
    externalUrl?: string;
    externalTitle?: string;
    direction: DocSyncDirection;
}

export const docSyncLinkRepository = {
    async create(input: CreateDocSyncLinkInput): Promise<IDocSyncLink> {
        await connectDB();
        const link = new DocSyncLink({ ...input, provider: 'notion' });
        return await link.save();
    },

    async findByDocumentId(documentId: string): Promise<IDocSyncLink | null> {
        await connectDB();
        return await DocSyncLink.findOne({ documentId });
    },

    /**
     * Find a link by documentId without an org filter. Worker-only — used by
     * the push-on-save job which runs outside any request session.
     */
    async findByDocumentIdAny(documentId: string): Promise<IDocSyncLink | null> {
        await connectDB();
        return await DocSyncLink.findOne({ documentId });
    },

    async findById(id: string): Promise<IDocSyncLink | null> {
        await connectDB();
        return await DocSyncLink.findById(id);
    },

    /** All links — scanned by the sync cron. */
    async findAll(): Promise<IDocSyncLink[]> {
        await connectDB();
        return await DocSyncLink.find({});
    },

    async updateDirection(
        documentId: string,
        direction: DocSyncDirection
    ): Promise<IDocSyncLink | null> {
        await connectDB();
        return await DocSyncLink.findOneAndUpdate(
            { documentId },
            { direction },
            { new: true }
        );
    },

    async setStatus(id: string, syncStatus: DocSyncStatus, lastError?: string | null): Promise<void> {
        await connectDB();
        await DocSyncLink.findByIdAndUpdate(id, { syncStatus, lastError: lastError ?? null });
    },

    /** Record a successful sync and the high-water marks on both sides. */
    async markSynced(
        id: string,
        marks: { externalLastEditedAt?: Date | null; localUpdatedAt?: Date | null }
    ): Promise<void> {
        await connectDB();
        await DocSyncLink.findByIdAndUpdate(id, {
            lastSyncedAt: new Date(),
            syncStatus: 'idle',
            lastError: null,
            ...(marks.externalLastEditedAt !== undefined
                ? { externalLastEditedAt: marks.externalLastEditedAt }
                : {}),
            ...(marks.localUpdatedAt !== undefined ? { localUpdatedAt: marks.localUpdatedAt } : {}),
        });
    },

    async delete(documentId: string): Promise<boolean> {
        await connectDB();
        const result = await DocSyncLink.findOneAndDelete({ documentId });
        return !!result;
    },
};

export default docSyncLinkRepository;
