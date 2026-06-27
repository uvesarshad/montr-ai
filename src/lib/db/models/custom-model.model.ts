import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Custom Model Schema
 * 
 * Stores admin-added custom models (e.g., OpenRouter model IDs).
 * These models are merged with built-in models at runtime.
 */

export interface ICustomModel extends Document {
    /** Model ID (OpenRouter ID or AI SDK model ID) */
    openRouterId: string;
    /** Display name for UI */
    displayName: string;
    /** Provider (e.g., 'openai', 'anthropic', 'google', 'openrouter') */
    provider: string;
    /** Routing method: 'openrouter' or 'aisdk' */
    routing: 'openrouter' | 'aisdk';
    /** Model type */
    type: 'text' | 'image' | 'video';
    /** Access tier */
    tier: 'free' | 'pro' | 'enterprise';
    /** Credits consumed per request */
    creditCost: number;
    /** Whether this model is enabled/available */
    isEnabled: boolean;
    /** Admin user ID who added this model */
    addedBy: string;
    /** Optional description */
    description?: string;
    /** Timestamps */
    createdAt: Date;
    updatedAt: Date;
}

const CustomModelSchema = new Schema<ICustomModel>(
    {
        openRouterId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        displayName: {
            type: String,
            required: true,
            trim: true,
        },
        provider: {
            type: String,
            required: true,
            default: 'openrouter',
            trim: true,
        },
        routing: {
            type: String,
            enum: ['openrouter', 'aisdk'],
            required: true,
            default: 'openrouter',
        },
        type: {
            type: String,
            enum: ['text', 'image', 'video'],
            required: true,
            default: 'text',
        },
        tier: {
            type: String,
            enum: ['free', 'pro', 'enterprise'],
            required: true,
            default: 'pro',
        },
        creditCost: {
            type: Number,
            required: true,
            default: 10,
            min: 1,
        },
        isEnabled: {
            type: Boolean,
            default: true,
        },
        addedBy: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            default: '',
        },
    },
    {
        timestamps: true,
        collection: 'custom_models',
    }
);

// Indexes
CustomModelSchema.index({ type: 1 });
CustomModelSchema.index({ isEnabled: 1 });

// Prevent model recompilation in development
const CustomModel: Model<ICustomModel> =
    mongoose.models.CustomModel || mongoose.model<ICustomModel>('CustomModel', CustomModelSchema);

export default CustomModel;
