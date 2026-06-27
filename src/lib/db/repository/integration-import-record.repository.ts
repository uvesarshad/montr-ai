import { connectDB } from '@/lib/mongodb';
import IntegrationImportRecord, {
    IIntegrationImportRecord,
    IntegrationImportProvider,
    IntegrationImportRecordType,
} from '@/lib/db/models/integration-import-record.model';

/** Payload for a single record to upsert — the dedup key is org+provider+recordType+externalId. */
export interface UpsertImportRecordInput {
    brandId?: string | null;
    connectionId: string;
    provider: IntegrationImportProvider;
    recordType: IntegrationImportRecordType;
    externalId: string;
    externalListId?: string | null;
    email?: string | null;
    name?: string | null;
    data: Record<string, unknown>;
}

export interface FindImportRecordsOptions {
    provider?: IntegrationImportProvider;
    recordType?: IntegrationImportRecordType;
    limit?: number;
    skip?: number;
}

/**
 * Integration Import Record Repository
 *
 * All reads/writes are organization-scoped — callers must pass the
 * organizationId read from the session user's DB record, never from the client.
 */
export const integrationImportRecordRepository = {
    /**
     * Bulk upsert imported records on the unique key
     * (organizationId, provider, recordType, externalId). Sets `lastSyncedAt`
     * on every write and `importedAt` only on first insert.
     */
    async upsertMany(records: UpsertImportRecordInput[]): Promise<number> {
        if (records.length === 0) return 0;
        await connectDB();

        const now = new Date();
        const operations = records.map((record) => ({
            updateOne: {
                filter: {
                    provider: record.provider,
                    recordType: record.recordType,
                    externalId: record.externalId,
                },
                update: {
                    $set: {
                        brandId: record.brandId ?? null,
                        connectionId: record.connectionId,
                        externalListId: record.externalListId ?? null,
                        email: record.email ?? null,
                        name: record.name ?? null,
                        data: record.data,
                        lastSyncedAt: now,
                    },
                    $setOnInsert: {
                        provider: record.provider,
                        recordType: record.recordType,
                        externalId: record.externalId,
                        importedAt: now,
                    },
                },
                upsert: true,
            },
        }));

        const result = await IntegrationImportRecord.bulkWrite(operations, { ordered: false });
        return (result.upsertedCount || 0) + (result.modifiedCount || 0);
    },

    async countByConnection(connectionId: string): Promise<number> {
        await connectDB();
        return await IntegrationImportRecord.countDocuments({ connectionId });
    },

    async findByOrganization(
        options: FindImportRecordsOptions = {}
    ): Promise<IIntegrationImportRecord[]> {
        await connectDB();

        const filter: Record<string, unknown> = { };
        if (options.provider) filter.provider = options.provider;
        if (options.recordType) filter.recordType = options.recordType;

        return await IntegrationImportRecord.find(filter)
            .sort({ lastSyncedAt: -1, createdAt: -1 })
            .skip(Math.max(0, options.skip || 0))
            .limit(Math.max(1, Math.min(options.limit || 100, 1000)));
    },

    async deleteByConnection(connectionId: string): Promise<number> {
        await connectDB();
        const result = await IntegrationImportRecord.deleteMany({ connectionId });
        return result.deletedCount || 0;
    },
};

export default integrationImportRecordRepository;
