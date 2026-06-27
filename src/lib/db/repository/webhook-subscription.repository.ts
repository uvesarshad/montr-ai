import WebhookSubscription, {
    IWebhookSubscription,
} from '../models/webhook-subscription.model';
import { connectDB } from '@/lib/mongodb';

export interface CreateWebhookSubscriptionInput {
    brandId?: string;
    createdByUserId: string;
    name: string;
    url: string;
    secret: string;
    events?: string[];
    active?: boolean;
}

export interface UpdateWebhookSubscriptionInput {
    name?: string;
    url?: string;
    secret?: string;
    events?: string[];
    active?: boolean;
}

export interface ListActiveForEventInput {
    brandId?: string;
    event: string;
}

class WebhookSubscriptionRepository {
    async create(input: CreateWebhookSubscriptionInput): Promise<IWebhookSubscription> {
        await connectDB();
        const sub = new WebhookSubscription(input);
        return sub.save();
    }

    async findById(id: string): Promise<IWebhookSubscription | null> {
        await connectDB();
        return WebhookSubscription.findById(id).exec();
    }

    async listByOrg(): Promise<IWebhookSubscription[]> {
        await connectDB();
        return WebhookSubscription.find({ })
            .sort({ createdAt: -1 })
            .exec();
    }

    async update(
        id: string,
        input: UpdateWebhookSubscriptionInput
    ): Promise<IWebhookSubscription | null> {
        await connectDB();
        return WebhookSubscription.findByIdAndUpdate(id, { $set: input }, { new: true }).exec();
    }

    async delete(id: string): Promise<boolean> {
        await connectDB();
        const result = await WebhookSubscription.deleteOne({ _id: id }).exec();
        return result.deletedCount > 0;
    }

    /**
     * Find active subscriptions in the org that are subscribed to the given
     * event. When brandId is supplied, also include org-wide subscriptions
     * (brandId null) so a global hook receives brand-scoped events.
     */
    async listActiveForEvent(input: ListActiveForEventInput): Promise<IWebhookSubscription[]> {
        await connectDB();

        const query: Record<string, unknown> = {
            active: true,
            events: input.event,
        };

        if (input.brandId) {
            query.$or = [{ brandId: input.brandId }, { brandId: null }];
        }

        return WebhookSubscription.find(query).exec();
    }

    async recordDelivery(
        id: string,
        delivery: { status: number }
    ): Promise<IWebhookSubscription | null> {
        await connectDB();
        return WebhookSubscription.findByIdAndUpdate(
            id,
            {
                $set: {
                    lastDeliveryAt: new Date(),
                    lastDeliveryStatus: delivery.status,
                    failureCount: 0,
                },
            },
            { new: true }
        ).exec();
    }

    async recordFailure(id: string): Promise<IWebhookSubscription | null> {
        await connectDB();
        return WebhookSubscription.findByIdAndUpdate(
            id,
            {
                $set: { lastDeliveryAt: new Date() },
                $inc: { failureCount: 1 },
            },
            { new: true }
        ).exec();
    }
}

export const webhookSubscriptionRepository = new WebhookSubscriptionRepository();
