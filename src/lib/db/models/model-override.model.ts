import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IModelOverride extends Document {
    modelId: string; // The built-in model ID to override
    name?: string; // Override display name
    tier?: 'free' | 'pro' | 'enterprise'; // Override tier
    creditCost?: number; // Override credit cost
    isEnabled: boolean; // Enable/disable the model
    isHidden: boolean; // Hide from model list
    updatedBy: string; // Admin who made the change
    createdAt: Date;
    updatedAt: Date;
}

const ModelOverrideSchema = new Schema<IModelOverride>(
    {
        modelId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        name: {
            type: String,
            default: undefined,
        },
        tier: {
            type: String,
            enum: ['free', 'pro', 'enterprise'],
            default: undefined,
        },
        creditCost: {
            type: Number,
            min: 1,
            default: undefined,
        },
        isEnabled: {
            type: Boolean,
            default: true,
        },
        isHidden: {
            type: Boolean,
            default: false,
        },
        updatedBy: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
        collection: 'model_overrides',
    }
);

// Indexes
ModelOverrideSchema.index({ isEnabled: 1 });

const ModelOverride: Model<IModelOverride> =
    mongoose.models.ModelOverride || mongoose.model<IModelOverride>('ModelOverride', ModelOverrideSchema);

export default ModelOverride;
