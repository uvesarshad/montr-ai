import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IWhatsAppCustomFieldValue extends Document {
    fieldId: Types.ObjectId;
    contactId: Types.ObjectId;

    value: string; // Store all values as string, convert when needed

    createdAt: Date;
    updatedAt: Date;
}

const WhatsAppCustomFieldValueSchema = new Schema<IWhatsAppCustomFieldValue>(
    {
        fieldId: {
            type: Schema.Types.ObjectId,
            ref: 'WhatsAppCustomField',
            required: true,
            index: true,
        },
        contactId: {
            type: Schema.Types.ObjectId,
            ref: 'Contact',
            required: true,
            index: true,
        },
        value: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
        collection: 'whatsapp_custom_field_values',
    }
);

// Unique constraint: one value per field per contact
WhatsAppCustomFieldValueSchema.index({ fieldId: 1, contactId: 1 }, { unique: true });

// Indexes for queries
WhatsAppCustomFieldValueSchema.index({ contactId: 1 });
WhatsAppCustomFieldValueSchema.index({ contactId: 1, fieldId: 1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.WhatsAppCustomFieldValue) {
        delete mongoose.models.WhatsAppCustomFieldValue;
    }
}

const WhatsAppCustomFieldValue: Model<IWhatsAppCustomFieldValue> =
    mongoose.models.WhatsAppCustomFieldValue ||
    mongoose.model<IWhatsAppCustomFieldValue>('WhatsAppCustomFieldValue', WhatsAppCustomFieldValueSchema);

export default WhatsAppCustomFieldValue;
