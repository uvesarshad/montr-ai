import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISystemSettings extends Document {
    type: string; // 'ai-defaults'
    settings: Record<string, unknown>; // Flexible structure for different setting types
    updatedBy?: string; // Admin ID who last updated
    createdAt: Date;
    updatedAt: Date;
}

const SystemSettingsSchema = new Schema<ISystemSettings>(
    {
        type: {
            type: String,
            required: true,
            unique: true, // Only one document per type
            default: 'ai-defaults',
        },
        settings: {
            type: Schema.Types.Mixed,
            default: {},
        },
        updatedBy: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'system_settings',
    }
);

// Prevent model recompilation in dev
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.SystemSettings) {
        delete mongoose.models.SystemSettings;
    }
}

const SystemSettings: Model<ISystemSettings> = mongoose.models.SystemSettings || mongoose.model<ISystemSettings>('SystemSettings', SystemSettingsSchema);

export default SystemSettings;
