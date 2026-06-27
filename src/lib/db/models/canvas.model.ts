import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICanvas extends Document {
    userId: string;
    /** Agency mode (B2-5.4) — brand scope. Optional during rollout. */
    brandId?: string;
    name: string;
    data: string; // JSON string of React Flow data
    previewKey?: string; // S3 key for preview image (permanent)
    previewUrl?: string; // S3 presigned URL (generated on-the-fly, not stored)
    createdAt: Date;
    updatedAt: Date;
}

const CanvasSchema = new Schema<ICanvas>(
    {
        userId: {
            type: String,
            required: true,
            index: true,
        },
        brandId: {
            type: String,
            index: true,
            default: null,
        },
        name: {
            type: String,
            required: true,
            trim: true,
            default: 'Untitled Canvas',
        },
        data: {
            type: String,
            required: true,
            default: JSON.stringify({ nodes: [], edges: [] }),
        },
        previewKey: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'canvases',
    }
);

// Indexes
CanvasSchema.index({ userId: 1, createdAt: -1 });
CanvasSchema.index({ userId: 1, updatedAt: -1 });
CanvasSchema.index({ updatedAt: -1 });
CanvasSchema.index({ brandId: 1, updatedAt: -1 });

// Prevent model recompilation in development
const Canvas: Model<ICanvas> = mongoose.models.Canvas || mongoose.model<ICanvas>('Canvas', CanvasSchema);

export default Canvas;
