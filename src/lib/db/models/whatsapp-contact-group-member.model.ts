import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IWhatsAppContactGroupMember extends Document {
    groupId: Types.ObjectId;
    contactId: Types.ObjectId;

    addedById: Types.ObjectId;
    addedAt: Date;

    createdAt: Date;
    updatedAt: Date;
}

const WhatsAppContactGroupMemberSchema = new Schema<IWhatsAppContactGroupMember>(
    {
        groupId: {
            type: Schema.Types.ObjectId,
            ref: 'WhatsAppContactGroup',
            required: true,
            index: true,
        },
        contactId: {
            type: Schema.Types.ObjectId,
            ref: 'CrmContact',
            required: true,
            index: true,
        },
        addedById: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        addedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
        collection: 'whatsapp_contact_group_members',
    }
);

// Unique constraint: one contact can be in a group only once
WhatsAppContactGroupMemberSchema.index({ groupId: 1, contactId: 1 }, { unique: true });

// Indexes for queries
WhatsAppContactGroupMemberSchema.index({ groupId: 1 });
WhatsAppContactGroupMemberSchema.index({ contactId: 1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.WhatsAppContactGroupMember) {
        delete mongoose.models.WhatsAppContactGroupMember;
    }
}

const WhatsAppContactGroupMember: Model<IWhatsAppContactGroupMember> =
    mongoose.models.WhatsAppContactGroupMember ||
    mongoose.model<IWhatsAppContactGroupMember>('WhatsAppContactGroupMember', WhatsAppContactGroupMemberSchema);

export default WhatsAppContactGroupMember;
