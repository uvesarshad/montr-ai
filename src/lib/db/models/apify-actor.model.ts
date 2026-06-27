import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Apify Actor Model
 * 
 * Stores configuration for different Apify actors used for scraping.
 * Each actor has a configurable credit cost that is deducted from the user's
 * shared credit pool (same as AI models).
 */

export interface IApifyActor extends Document {
    /** Apify actor ID (e.g., 'shu8hvrXbJbY3Eb9W') */
    actorId: string;
    /** Display name for UI (e.g., 'Instagram Scraper') */
    name: string;
    /** Description of what the actor does */
    description?: string;
    /** Platform identifier (e.g., 'instagram', 'linkedin', 'twitter') */
    platform: string;
    /** Credits consumed per request */
    creditCost: number;
    /** Whether the actor is currently enabled */
    isEnabled: boolean;
    /** User ID of admin who added this actor */
    addedBy: string;
    /** Timestamps */
    createdAt: Date;
    updatedAt: Date;
}

const ApifyActorSchema = new Schema<IApifyActor>(
    {
        actorId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            default: null,
        },
        platform: {
            type: String,
            required: true,
            lowercase: true,
            index: true,
        },
        creditCost: {
            type: Number,
            required: true,
            min: 1,
            default: 10,
        },
        isEnabled: {
            type: Boolean,
            default: true,
            index: true,
        },
        addedBy: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
        collection: 'apify_actors',
    }
);

// Indexes for efficient queries
ApifyActorSchema.index({ platform: 1, isEnabled: 1 });

// Prevent model recompilation in development
const ApifyActor: Model<IApifyActor> =
    mongoose.models.ApifyActor || mongoose.model<IApifyActor>('ApifyActor', ApifyActorSchema);

export default ApifyActor;
