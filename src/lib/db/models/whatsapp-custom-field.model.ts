import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IWhatsAppCustomField extends Document {
    whatsappAccountId: Types.ObjectId;

    name: string;
    fieldKey: string; // Unique key for variable interpolation (e.g., 'birthday')
    fieldType: 'text' | 'number' | 'date' | 'dropdown' | 'checkbox' | 'url' | 'email' | 'phone';

    // For dropdown type
    options?: string[]; // Array of options for dropdown fields

    // Default value
    defaultValue?: string;

    // Validation
    required: boolean;

    // Display order
    order: number;

    // Metadata
    createdById: Types.ObjectId;
    deletedAt?: Date;

    createdAt: Date;
    updatedAt: Date;
}

const WhatsAppCustomFieldSchema = new Schema<IWhatsAppCustomField>(
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
        fieldKey: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            maxlength: 50,
        },
        fieldType: {
            type: String,
            enum: ['text', 'number', 'date', 'dropdown', 'checkbox', 'url', 'email', 'phone'],
            required: true,
        },
        options: [String],
        defaultValue: String,
        required: {
            type: Boolean,
            default: false,
        },
        order: {
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
        collection: 'whatsapp_custom_fields',
    }
);

// Unique constraint: field key must be unique per account
WhatsAppCustomFieldSchema.index({ whatsappAccountId: 1, fieldKey: 1 }, { unique: true });

// Indexes
WhatsAppCustomFieldSchema.index({ deletedAt: 1 });
WhatsAppCustomFieldSchema.index({ whatsappAccountId: 1, deletedAt: 1 });
WhatsAppCustomFieldSchema.index({ order: 1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.WhatsAppCustomField) {
        delete mongoose.models.WhatsAppCustomField;
    }
}

const WhatsAppCustomField: Model<IWhatsAppCustomField> =
    mongoose.models.WhatsAppCustomField || mongoose.model<IWhatsAppCustomField>('WhatsAppCustomField', WhatsAppCustomFieldSchema);

export default WhatsAppCustomField;
