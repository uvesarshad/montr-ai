import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IWhatsAppAutoReply extends Document {
    whatsappAccountId: Types.ObjectId;

    name: string;
    isActive: boolean;

    // Trigger configuration
    trigger: {
        type: 'keyword' | 'greeting' | 'always' | 'business_hours' | 'welcome' | 'exact_match' | 'contains';
        keywords?: string[]; // For keyword type
        matchType?: 'exact' | 'contains' | 'keyword'; // How to match keywords
    };

    // Conditions
    conditions?: {
        businessHours?: {
            enabled: boolean;
            timezone?: string;
            schedule?: {
                monday?: { start: string; end: string };
                tuesday?: { start: string; end: string };
                wednesday?: { start: string; end: string };
                thursday?: { start: string; end: string };
                friday?: { start: string; end: string };
                saturday?: { start: string; end: string };
                sunday?: { start: string; end: string };
            };
        };
        tags?: string[]; // Only trigger for contacts with these tags
        isFirstMessage?: boolean; // Only trigger for first message from contact
    };

    // Response configuration
    response: {
        type: 'text' | 'template';
        content: string; // Text content or template name (supports variables {{firstName}}, {{lastName}}, etc.)
        templateLanguage?: string; // For template type
        delay?: number; // Delay in seconds before sending reply
        buttons?: Array<{
            type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
            text: string;
            url?: string; // For URL buttons
            phoneNumber?: string; // For phone buttons
        }>; // Interactive buttons (max 3)
    };

    // Reply chaining
    nextReplyId?: Types.ObjectId; // Chain to another auto-reply after this one
    chainDelay?: number; // Delay in seconds before triggering next reply

    // Usage tracking
    usageCount: number; // Number of times this reply was sent
    lastUsedAt?: Date; // Last time this reply was triggered

    priority: number; // Higher priority = checked first

    createdById: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const WhatsAppAutoReplySchema = new Schema<IWhatsAppAutoReply>(
    {
        whatsappAccountId: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'WhatsAppAccount',
            index: true,
        },
        name: {
            type: String,
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        trigger: {
            type: {
                type: String,
                enum: ['keyword', 'greeting', 'always', 'business_hours', 'welcome', 'exact_match', 'contains'],
                required: true,
            },
            keywords: [String],
            matchType: {
                type: String,
                enum: ['exact', 'contains', 'keyword'],
                default: 'keyword',
            },
        },
        conditions: {
            businessHours: {
                enabled: Boolean,
                timezone: String,
                schedule: {
                    monday: { start: String, end: String },
                    tuesday: { start: String, end: String },
                    wednesday: { start: String, end: String },
                    thursday: { start: String, end: String },
                    friday: { start: String, end: String },
                    saturday: { start: String, end: String },
                    sunday: { start: String, end: String },
                },
            },
            tags: [String],
            isFirstMessage: Boolean,
        },
        response: {
            type: {
                type: String,
                enum: ['text', 'template'],
                required: true,
            },
            content: {
                type: String,
                required: true,
            },
            templateLanguage: String,
            delay: {
                type: Number,
                default: 0, // Seconds
            },
            buttons: [
                {
                    type: {
                        type: String,
                        enum: ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'],
                        required: true,
                    },
                    text: {
                        type: String,
                        required: true,
                    },
                    url: String,
                    phoneNumber: String,
                },
            ],
        },
        nextReplyId: {
            type: Schema.Types.ObjectId,
            ref: 'WhatsAppAutoReply',
        },
        chainDelay: {
            type: Number,
            default: 0, // Seconds
        },
        usageCount: {
            type: Number,
            default: 0,
        },
        lastUsedAt: Date,
        priority: {
            type: Number,
            default: 0,
        },
        createdById: {
            type: Schema.Types.ObjectId,
            required: true,
            ref: 'User',
        },
    },
    {
        timestamps: true,
    }
);

// Indexes
WhatsAppAutoReplySchema.index({ whatsappAccountId: 1, isActive: 1 });
WhatsAppAutoReplySchema.index({ priority: -1 });

const WhatsAppAutoReply = mongoose.models.WhatsAppAutoReply ||
    mongoose.model<IWhatsAppAutoReply>('WhatsAppAutoReply', WhatsAppAutoReplySchema);

export default WhatsAppAutoReply;
