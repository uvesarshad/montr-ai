import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICanvasVersion extends Document {
    canvasId: string;
    userId: string;
    version: number;
    data: string; // JSON string snapshot of React Flow data { nodes, edges }
    label?: string; // Optional human label (e.g. "Backup before restoring to v5")
    saveKind: 'manual' | 'auto'; // How this snapshot was created
    createdAt: Date;
    updatedAt: Date;
}

const CanvasVersionSchema = new Schema<ICanvasVersion>(
    {
        canvasId: {
            type: String,
            required: true,
            index: true,
        },
        userId: {
            type: String,
            required: true,
        },
        version: {
            type: Number,
            required: true,
        },
        data: {
            type: String,
            required: true,
        },
        label: {
            type: String,
            default: null,
        },
        saveKind: {
            type: String,
            enum: ['manual', 'auto'],
            default: 'auto',
        },
    },
    {
        timestamps: true,
        collection: 'canvas_versions',
    }
);

// Indexes
CanvasVersionSchema.index({ canvasId: 1, createdAt: -1 }); // Time-based queries, newest first
CanvasVersionSchema.index({ canvasId: 1, version: -1 }); // Get versions for a canvas, newest first

// Prevent model recompilation in development
const CanvasVersionModel: Model<ICanvasVersion> =
    mongoose.models.CanvasVersion || mongoose.model<ICanvasVersion>('CanvasVersion', CanvasVersionSchema);

export default CanvasVersionModel;
