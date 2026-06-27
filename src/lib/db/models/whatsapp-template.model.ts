import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IWhatsAppTemplate extends Document {
    /** Agency-mode brand scope (B3-4.6.1). */
    brandId?: Types.ObjectId | null;
    whatsappAccountId: Types.ObjectId;

    // Meta Template Data
    metaId: string; // ID from Meta
    name: string;
    language: string;
    status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED';
    category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

    // Components (Header, Body, Footer, Buttons)
    components: unknown[]; // Stored as JSON

    lastSyncedAt: Date;
    updatedAt: Date;
    createdAt: Date;
}

const WhatsAppTemplateSchema = new Schema<IWhatsAppTemplate>(
    {
        brandId: {
            type: Schema.Types.ObjectId,
            ref: 'Brand',
            default: null,
            index: true,
        },
        whatsappAccountId: {
            type: Schema.Types.ObjectId,
            ref: 'WhatsAppAccount',
            required: true,
            index: true,
        },
        metaId: {
            type: String,
            required: true,
        },
        name: {
            type: String,
            required: true,
            index: true,
        },
        language: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            required: true,
        },
        category: {
            type: String,
            required: true,
        },
        components: {
            type: Schema.Types.Mixed,
            default: [],
        },
        lastSyncedAt: Date,
    },
    {
        timestamps: true,
        collection: 'whatsapp_templates',
    }
);

// Indexes
WhatsAppTemplateSchema.index({ whatsappAccountId: 1, metaId: 1 }, { unique: true });
WhatsAppTemplateSchema.index({ status: 1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.WhatsAppTemplate) {
        delete mongoose.models.WhatsAppTemplate;
    }
}

const WhatsAppTemplate: Model<IWhatsAppTemplate> =
    mongoose.models.WhatsAppTemplate || mongoose.model<IWhatsAppTemplate>('WhatsAppTemplate', WhatsAppTemplateSchema);

export default WhatsAppTemplate;
