import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWebhookSubscription extends Document {
    brandId?: string;
    createdByUserId: string;
    name: string;
    url: string;
    secret: string;                   // For HMAC signing
    events: string[];                 // e.g. ['post.published', 'post.failed', 'post.approved']
    active: boolean;
    lastDeliveryAt?: Date;
    lastDeliveryStatus?: number;
    failureCount: number;

    createdAt: Date;
    updatedAt: Date;
}

const WebhookSubscriptionSchema = new Schema<IWebhookSubscription>(
    {
        brandId: {
            type: String,
            default: null,
            index: true,
        },
        createdByUserId: {
            type: String,
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        url: {
            type: String,
            required: true,
            trim: true,
        },
        secret: {
            type: String,
            required: true,
        },
        events: {
            type: [String],
            default: [],
        },
        active: {
            type: Boolean,
            default: true,
        },
        lastDeliveryAt: {
            type: Date,
            default: null,
        },
        lastDeliveryStatus: {
            type: Number,
            default: null,
        },
        failureCount: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
        collection: 'webhook_subscriptions',
    }
);

// Indexes
WebhookSubscriptionSchema.index({ active: 1 });

const WebhookSubscription: Model<IWebhookSubscription> =
    mongoose.models.WebhookSubscription ||
    mongoose.model<IWebhookSubscription>('WebhookSubscription', WebhookSubscriptionSchema);

export default WebhookSubscription;
