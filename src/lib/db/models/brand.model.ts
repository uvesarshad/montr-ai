import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IBrand extends Document {
    name: string;
    handle: string;
    userId: string;           // Owner of the brand
    avatarUrl?: string;
    industry?: string;        // Industry vertical — drives benchmark baselines (social Epic 7.2)
    createdAt: Date;
    updatedAt: Date;
}

const BrandSchema = new Schema<IBrand>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        handle: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        userId: {
            type: String,
            required: true,
            index: true,
        },
        avatarUrl: {
            type: String,
            default: null,
        },
        industry: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'brands',
    }
);

// Indexes
// Indexes
BrandSchema.index({ userId: 1, handle: 1 }, { unique: true }); // Handle unique per user

// Prevent model recompilation in development
const Brand: Model<IBrand> =
    mongoose.models.Brand || mongoose.model<IBrand>('Brand', BrandSchema);

export default Brand;
