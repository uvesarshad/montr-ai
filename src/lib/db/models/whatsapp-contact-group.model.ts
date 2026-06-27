import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IWhatsAppContactGroup extends Document {
    whatsappAccountId: Types.ObjectId;

    name: string;
    description?: string;

    // Stats
    contactCount: number;

    // Metadata
    createdById: Types.ObjectId;
    deletedAt?: Date;

    createdAt: Date;
    updatedAt: Date;
}

const WhatsAppContactGroupSchema = new Schema<IWhatsAppContactGroup>(
    {
        whatsappAccountId: {
            type: Schema.Types.ObjectId,
            ref: 'WhatsAppAccount',
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },
        description: {
            type: String,
            maxlength: 500,
        },
        contactCount: {
            type: Number,
            default: 0,
        },
        createdById: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        deletedAt: Date,
    },
    {
        timestamps: true,
        collection: 'whatsapp_contact_groups',
    }
);

// Indexes
WhatsAppContactGroupSchema.index({ deletedAt: 1 });
WhatsAppContactGroupSchema.index({ whatsappAccountId: 1, deletedAt: 1 });
WhatsAppContactGroupSchema.index({ name: 1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.WhatsAppContactGroup) {
        delete mongoose.models.WhatsAppContactGroup;
    }
}

const WhatsAppContactGroup: Model<IWhatsAppContactGroup> =
    mongoose.models.WhatsAppContactGroup || mongoose.model<IWhatsAppContactGroup>('WhatsAppContactGroup', WhatsAppContactGroupSchema);

export default WhatsAppContactGroup;
