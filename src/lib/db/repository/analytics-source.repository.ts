import { connectDB } from '@/lib/mongodb';
import AnalyticsSource, { IAnalyticsSource, AnalyticsSourceType } from '@/lib/db/models/analytics-source.model';
import { encryptToken, decryptToken } from '@/lib/encryption';

export interface CreateAnalyticsSourceInput {
    brandId: string;
    userId: string;
    sourceType: AnalyticsSourceType;
    externalId: string;
    displayName: string;
    accessToken: string;          // Will be encrypted
    refreshToken?: string;        // Will be encrypted
    tokenExpiresAt?: Date;
    scopes?: string[];
    metadata?: IAnalyticsSource['metadata'];
}

export interface UpdateAnalyticsSourceInput {
    accessToken?: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
    isActive?: boolean;
    lastSyncedAt?: Date;
    lastUsedAt?: Date;
    lastError?: string;
    displayName?: string;
    metadata?: IAnalyticsSource['metadata'];
}

export interface DecryptedAnalyticsSource {
    source: IAnalyticsSource;
    accessToken: string;
    refreshToken?: string;
}

/**
 * Analytics Source Repository (GA4 properties, Search Console sites)
 * Provides CRUD operations with automatic token encryption/decryption.
 * All read paths are organization-scoped — callers must pass the
 * organizationId resolved from the session user (never client-supplied).
 */
export const analyticsSourceRepository = {
    /**
     * Create a new analytics source with encrypted tokens
     */
    async create(input: CreateAnalyticsSourceInput): Promise<IAnalyticsSource> {
        await connectDB();

        const source = new AnalyticsSource({
            brandId: input.brandId,
            userId: input.userId,
            sourceType: input.sourceType,
            externalId: input.externalId,
            displayName: input.displayName,
            encryptedAccessToken: encryptToken(input.accessToken),
            encryptedRefreshToken: input.refreshToken ? encryptToken(input.refreshToken) : null,
            tokenExpiresAt: input.tokenExpiresAt || null,
            scopes: input.scopes || [],
            metadata: input.metadata,
            isActive: true,
        });

        return await source.save();
    },

    /**
     * Find analytics source by ID (without decrypted tokens)
     */
    async findById(id: string): Promise<IAnalyticsSource | null> {
        await connectDB();
        return await AnalyticsSource.findById(id);
    },

    /**
     * Find analytics source by ID with decrypted tokens
     */
    async findByIdWithTokens(id: string): Promise<DecryptedAnalyticsSource | null> {
        await connectDB();
        const source = await AnalyticsSource.findById(id).select('+encryptedAccessToken +encryptedRefreshToken');

        if (!source) return null;

        return {
            source,
            accessToken: decryptToken(source.encryptedAccessToken),
            refreshToken: source.encryptedRefreshToken ? decryptToken(source.encryptedRefreshToken) : undefined,
        };
    },

    /**
     * Find all active sources for an organization
     */
    async findByOrganizationId(): Promise<IAnalyticsSource[]> {
        await connectDB();
        return await AnalyticsSource.find({ isActive: true }).sort({ createdAt: -1 });
    },

    /**
     * Find all active sources for a brand
     */
    async findByBrandId(brandId: string): Promise<IAnalyticsSource[]> {
        await connectDB();
        return await AnalyticsSource.find({ brandId, isActive: true }).sort({ createdAt: -1 });
    },

    /**
     * Find sources by type within an organization
     */
    async findByOrganizationAndType(sourceType: AnalyticsSourceType): Promise<IAnalyticsSource[]> {
        await connectDB();
        return await AnalyticsSource.find({ sourceType, isActive: true });
    },

    /**
     * Find source by external ID (to check if already connected)
     */
    async findByExternalId(sourceType: AnalyticsSourceType, externalId: string): Promise<IAnalyticsSource | null> {
        await connectDB();
        return await AnalyticsSource.findOne({ sourceType, externalId });
    },

    /**
     * Find all active sources (for the sync scheduler)
     */
    async findAllActive(sourceType?: AnalyticsSourceType): Promise<IAnalyticsSource[]> {
        await connectDB();
        const query: Record<string, unknown> = { isActive: true };
        if (sourceType) query.sourceType = sourceType;
        return await AnalyticsSource.find(query);
    },

    /**
     * Update tokens (with encryption)
     */
    async updateTokens(id: string, accessToken: string, refreshToken?: string, expiresAt?: Date): Promise<IAnalyticsSource | null> {
        await connectDB();

        const updateData: Record<string, unknown> = {
            encryptedAccessToken: encryptToken(accessToken),
            lastError: null, // Clear any previous error
        };

        if (refreshToken) {
            updateData.encryptedRefreshToken = encryptToken(refreshToken);
        }
        if (expiresAt) {
            updateData.tokenExpiresAt = expiresAt;
        }

        return await AnalyticsSource.findByIdAndUpdate(id, updateData, { new: true });
    },

    /**
     * Update source metadata
     */
    async update(id: string, input: UpdateAnalyticsSourceInput): Promise<IAnalyticsSource | null> {
        await connectDB();

        const updateData: Record<string, unknown> = {};

        // Handle token updates with encryption
        if (input.accessToken) {
            updateData.encryptedAccessToken = encryptToken(input.accessToken);
        }
        if (input.refreshToken) {
            updateData.encryptedRefreshToken = encryptToken(input.refreshToken);
        }

        // Handle other fields
        if (input.tokenExpiresAt !== undefined) updateData.tokenExpiresAt = input.tokenExpiresAt;
        if (input.isActive !== undefined) updateData.isActive = input.isActive;
        if (input.lastSyncedAt !== undefined) updateData.lastSyncedAt = input.lastSyncedAt;
        if (input.lastUsedAt !== undefined) updateData.lastUsedAt = input.lastUsedAt;
        if (input.lastError !== undefined) updateData.lastError = input.lastError;
        if (input.displayName !== undefined) updateData.displayName = input.displayName;
        if (input.metadata !== undefined) updateData.metadata = input.metadata;

        return await AnalyticsSource.findByIdAndUpdate(id, updateData, { new: true });
    },

    /**
     * Mark source as used
     */
    async markUsed(id: string): Promise<void> {
        await connectDB();
        await AnalyticsSource.findByIdAndUpdate(id, { lastUsedAt: new Date(), lastError: null });
    },

    /**
     * Mark a successful sync
     */
    async markSynced(id: string): Promise<void> {
        await connectDB();
        await AnalyticsSource.findByIdAndUpdate(id, { lastSyncedAt: new Date(), lastError: null });
    },

    /**
     * Record an error
     */
    async recordError(id: string, error: string): Promise<void> {
        await connectDB();
        await AnalyticsSource.findByIdAndUpdate(id, { lastError: error });
    },

    /**
     * Soft delete (deactivate) a source
     */
    async deactivate(id: string): Promise<IAnalyticsSource | null> {
        await connectDB();
        return await AnalyticsSource.findByIdAndUpdate(id, { isActive: false }, { new: true });
    },

    /**
     * Hard delete a source
     */
    async delete(id: string): Promise<boolean> {
        await connectDB();
        const result = await AnalyticsSource.findByIdAndDelete(id);
        return !!result;
    },

    /**
     * Check if token needs refresh (within 5 minutes of expiry)
     */
    async needsRefresh(id: string): Promise<boolean> {
        await connectDB();
        const source = await AnalyticsSource.findById(id);
        if (!source || !source.tokenExpiresAt) return false;

        const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
        return source.tokenExpiresAt < fiveMinutesFromNow;
    },
};

export default analyticsSourceRepository;
