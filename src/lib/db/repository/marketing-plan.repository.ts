import mongoose from 'mongoose';
import MarketingPlan, { IMarketingPlan } from '../models/marketing-plan.model';

export class MarketingPlanRepository {
    /**
     * Find plan by User ID and Brand ID (primary lookup)
     */
    async findByUserAndBrand(userId: string, brandId: string): Promise<IMarketingPlan | null> {
        await this.ensureConnection();
        return MarketingPlan.findOne({ userId, brandId }).exec();
    }

    /**
     * Find plan by User ID (legacy — returns first plan found)
     */
    async findByUserId(userId: string): Promise<IMarketingPlan | null> {
        await this.ensureConnection();
        return MarketingPlan.findOne({ userId }).exec();
    }

    /**
     * Find plan by Organization ID
     */
    async findByOrganizationId(): Promise<IMarketingPlan | null> {
        await this.ensureConnection();
        return MarketingPlan.findOne({ }).exec();
    }

    /**
     * Create new plan
     */
    async create(data: Partial<IMarketingPlan>): Promise<IMarketingPlan> {
        await this.ensureConnection();
        const plan = new MarketingPlan(data);
        return plan.save();
    }

    /**
     * Update plan
     */
    async update(id: string, data: Partial<IMarketingPlan>): Promise<IMarketingPlan | null> {
        await this.ensureConnection();
        return MarketingPlan.findByIdAndUpdate(
            id,
            { $set: data },
            { new: true }
        ).exec();
    }

    /**
     * Ensure MongoDB connection via Mongoose
     */
    private async ensureConnection(): Promise<void> {
        if (mongoose.connection.readyState !== 1) {
            const { connectMongoose } = await import('@/lib/mongodb');
            await connectMongoose();
        }
    }
}

export const marketingPlanRepository = new MarketingPlanRepository();
