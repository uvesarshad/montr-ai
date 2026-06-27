import mongoose from 'mongoose';
import Plan, { IPlan, IPlanFeatures } from '../models/plan.model';

export interface CreatePlanDto {
    name: string;
    displayName: string;
    description?: string;
    price: number;
    billingInterval: 'monthly' | 'yearly' | 'lifetime';
    features?: Partial<IPlanFeatures>;
    stripeProductId?: string;
    stripePriceId?: string;
    razorpayPlanId?: string;
}

export interface UpdatePlanDto {
    displayName?: string;
    description?: string;
    price?: number;
    billingInterval?: 'monthly' | 'yearly' | 'lifetime';
    features?: Partial<IPlanFeatures>;
    status?: 'active' | 'inactive';
    stripeProductId?: string;
    stripePriceId?: string;
    razorpayPlanId?: string;
}

export class PlanRepository {
    /**
     * Find plan by ID
     */
    async findById(planId: string): Promise<IPlan | null> {
        await this.ensureConnection();
        return Plan.findById(planId).exec();
    }

    /**
     * Find plan by name
     */
    async findByName(name: string): Promise<IPlan | null> {
        await this.ensureConnection();
        return Plan.findOne({ name }).exec();
    }

    /**
     * Find all plans
     */
    async findAll(): Promise<IPlan[]> {
        await this.ensureConnection();
        return Plan.find().sort({ createdAt: -1 }).exec();
    }

    /**
     * Find active plans
     */
    async findActive(): Promise<IPlan[]> {
        await this.ensureConnection();
        return Plan.find({ status: 'active' }).sort({ price: 1 }).exec();
    }

    /**
     * Create new plan
     */
    async create(data: CreatePlanDto): Promise<IPlan> {
        await this.ensureConnection();

        const plan = new Plan({
            name: data.name,
            displayName: data.displayName,
            description: data.description || '',
            price: data.price,
            billingInterval: data.billingInterval,
            features: data.features || {},
            stripeProductId: data.stripeProductId,
            stripePriceId: data.stripePriceId,
            razorpayPlanId: data.razorpayPlanId,
            status: 'active',
        });

        return plan.save();
    }

    /**
     * Update plan
     */
    async update(planId: string, data: UpdatePlanDto): Promise<IPlan | null> {
        await this.ensureConnection();

        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (data.displayName) updateData.displayName = data.displayName;
        if (data.description !== undefined) updateData.description = data.description;
        if (data.price !== undefined) updateData.price = data.price;
        if (data.billingInterval) updateData.billingInterval = data.billingInterval;
        if (data.features) updateData.features = data.features;
        if (data.status) updateData.status = data.status;
        if (data.stripeProductId !== undefined) updateData.stripeProductId = data.stripeProductId;
        if (data.stripePriceId !== undefined) updateData.stripePriceId = data.stripePriceId;
        if (data.razorpayPlanId !== undefined) updateData.razorpayPlanId = data.razorpayPlanId;

        return Plan.findByIdAndUpdate(
            planId,
            { $set: updateData },
            { new: true }
        ).exec();
    }

    /**
     * Delete plan
     */
    async delete(planId: string): Promise<boolean> {
        await this.ensureConnection();
        const result = await Plan.deleteOne({ _id: planId }).exec();
        return result.deletedCount > 0;
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

// Export singleton instance
export const planRepository = new PlanRepository();
