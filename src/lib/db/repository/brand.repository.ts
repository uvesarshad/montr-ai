// OSS single-tenant override of src/lib/db/repository/brand.repository.ts — generated CP-2 hand-patch; org-stripped, userId-scoped.
import { connectDB } from '@/lib/mongodb';
import Brand, { IBrand } from '@/lib/db/models/brand.model';

export interface CreateBrandInput {
    name: string;
    handle: string;
    userId: string;
    avatarUrl?: string;
}

export interface UpdateBrandInput {
    name?: string;
    handle?: string;
    avatarUrl?: string;
    industry?: string | null;
}

/**
 * Brand Repository
 * Provides CRUD operations for brands with user filtering
 */
export const brandRepository = {
    /**
     * Create a new brand
     */
    async create(input: CreateBrandInput): Promise<IBrand> {
        await connectDB();

        const brand = new Brand({
            name: input.name,
            handle: input.handle.toLowerCase().replace(/[^a-z0-9-_]/g, ''),
            userId: input.userId,
            avatarUrl: input.avatarUrl || null,
        });

        return await brand.save();
    },

    /**
     * Find brand by ID
     */
    async findById(id: string): Promise<IBrand | null> {
        await connectDB();
        return await Brand.findById(id);
    },

    /**
     * Find all brands for a user
     */
    async findByUserId(userId: string): Promise<IBrand[]> {
        await connectDB();
        return await Brand.find({ userId }).sort({ createdAt: -1 });
    },

    /**
     * Find all brands in the deployment
     * (single-tenant: the "organization" is the whole instance, so this returns every brand —
     *  preserves the original org-shared visibility semantics; name kept for call-site compatibility)
     */
    async findByOrganizationId(): Promise<IBrand[]> {
        await connectDB();
        return await Brand.find({}).sort({ createdAt: -1 });
    },

    /**
     * Find all brands accessible to a user
     */
    async findAccessibleBrands(userId: string): Promise<IBrand[]> {
        await connectDB();

        const query = { userId };

        return await Brand.find(query).sort({ createdAt: -1 });
    },

    /**
     * Update a brand
     */
    async update(id: string, input: UpdateBrandInput): Promise<IBrand | null> {
        await connectDB();

        const updateData: Partial<UpdateBrandInput> = {};
        if (input.name) updateData.name = input.name;
        if (input.handle) updateData.handle = input.handle.toLowerCase().replace(/[^a-z0-9-_]/g, '');
        if (input.avatarUrl !== undefined) updateData.avatarUrl = input.avatarUrl;
        if (input.industry !== undefined) updateData.industry = input.industry;

        return await Brand.findByIdAndUpdate(id, updateData, { new: true });
    },

    /**
     * Delete a brand
     */
    async delete(id: string): Promise<boolean> {
        await connectDB();
        const result = await Brand.findByIdAndDelete(id);
        return !!result;
    },

    /**
     * Count brands for a user (for limit checking)
     */
    async countByUserId(userId: string): Promise<number> {
        await connectDB();
        return await Brand.countDocuments({ userId });
    },

    /**
     * Check if user owns a brand
     */
    async isOwner(brandId: string, userId: string): Promise<boolean> {
        await connectDB();
        const brand = await Brand.findOne({ _id: brandId, userId });
        return !!brand;
    },

    /**
     * Check if handle is available for user
     */
    async isHandleAvailable(userId: string, handle: string, excludeBrandId?: string): Promise<boolean> {
        await connectDB();
        const normalizedHandle = handle.toLowerCase().replace(/[^a-z0-9-_]/g, '');
        const query: Record<string, unknown> = { userId, handle: normalizedHandle };
        if (excludeBrandId) {
            query._id = { $ne: excludeBrandId };
        }
        const existing = await Brand.findOne(query);
        return !existing;
    },
};

export default brandRepository;
