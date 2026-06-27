import mongoose, { Schema, Document, Types } from 'mongoose';

export type InboxChannelType =
    | 'whatsapp'
    | 'email'
    | 'instagram'
    | 'facebook'
    | 'discord'
    | 'slack'
    | 'telegram'
    | 'teams'
    | 'google_chat'
    | 'website'
    | 'api';

export interface IInboxChannelConfig {
    // WhatsApp
    wabaId?: string;
    phoneNumberId?: string;
    phoneNumber?: string;
    accessToken?: string; // Encrypted
    webhookVerifyToken?: string;

    // Email
    provider?: 'gmail' | 'outlook' | 'imap';
    email?: string;
    oauth?: {
        accessToken: string;
        refreshToken: string;
        expiresAt?: Date;
        scope?: string;
    };
    imap?: {
        host: string;
        port: number;
        secure: boolean;
        username: string;
        password: string; // Encrypted
    };
    smtp?: {
        host: string;
        port: number;
        secure: boolean;
        username: string;
        password: string; // Encrypted
    };

    // Instagram/Facebook
    pageId?: string;
    pageAccessToken?: string; // Encrypted
    instagramId?: string;

    // Discord
    botToken?: string; // Encrypted
    guildId?: string;
    guildName?: string;

    // Slack
    teamId?: string;
    teamName?: string;
    // botToken shared with Discord
    botUserId?: string;

    // Website
    websiteUrl?: string;
    websiteUrls?: string[];
    widgetToken?: string;
    stagingWidgetToken?: string;
    deploymentStatus?: 'draft' | 'staging' | 'live';
    aiModel?: string;
    systemPrompt?: string;
    chatbotType?: string;
    knowledgeBaseIds?: Types.ObjectId[];
    formIds?: Types.ObjectId[];
    autoTransferToHuman?: boolean;
    preChatFormEnabled?: boolean;
    preChatFormFields?: unknown[];
    widgetColor?: string;
    primaryColor?: string;
    welcomeMessage?: string;
    greeting?: string;
    placeholder?: string;
    widgetPosition?: 'bottom-right' | 'bottom-left';
    icon?: string;
    handoffTriggers?: string[];
    handoffConfidenceThreshold?: number;
    schedule?: {
        enabled: boolean;
        timezone: string;
        offlineMessage?: string;
        offlineCollectEmail?: boolean;
        hours: Array<{
            day: 0 | 1 | 2 | 3 | 4 | 5 | 6;
            open: string;
            close: string;
        }>;
    };
    messageCap?: number;

    // API Channel
    webhookUrl?: string;
    apiToken?: string; // Encrypted
    hmacToken?: string;

    // Telegram
    telegramBotToken?: string; // Encrypted
    telegramBotUsername?: string;
    telegramWebhookSecret?: string;

    // Microsoft Teams
    teamsAppId?: string;
    teamsAppPassword?: string; // Encrypted
    tenantId?: string;
    serviceUrl?: string;

    // Google Chat
    googleChatServiceAccountKey?: string; // Encrypted JSON key
    googleChatSpaceId?: string;
    googleChatProjectId?: string;

    // SLA
    sla?: {
        firstResponseTime: number; // minutes
        resolutionTime: number; // minutes
        enableAlerts: boolean;
        alertEmails?: string[];
    };
}

export interface IInboxChannel extends Document {
    /** Agency-mode brand scope (B3-4.6.1). Nullable for back-compat with pre-brand rows. */
    brandId?: Types.ObjectId | null;
    name: string; // User-defined name (e.g., "Support WhatsApp", "Sales Email")
    channelType: InboxChannelType;
    config: IInboxChannelConfig;

    /** Assigned AI bot for this channel (B3-4.5.5). Null = no bot; channel default behavior. */
    aiBotId?: Types.ObjectId | null;

    isActive: boolean;
    lastSyncAt?: Date;
    lastSyncError?: string;

    createdById: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const InboxChannelSchema = new Schema<IInboxChannel>(
    {
        brandId: {
            type: Schema.Types.ObjectId,
            ref: 'Brand',
            default: null,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        channelType: {
            type: String,
            enum: ['whatsapp', 'email', 'instagram', 'facebook', 'discord', 'slack', 'telegram', 'teams', 'google_chat', 'website', 'api'],
            required: true,
            index: true,
        },
        config: {
            type: Schema.Types.Mixed,
            required: true,
        },
        aiBotId: {
            type: Schema.Types.ObjectId,
            ref: 'AiBot',
            default: null,
            index: true,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        lastSyncAt: Date,
        lastSyncError: String,
        createdById: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    {
        timestamps: true,
        collection: 'inbox_channels',
    }
);

// Indexes
InboxChannelSchema.index({ channelType: 1 });
InboxChannelSchema.index({ isActive: 1 });
// Agency-mode (B3-4.6.1).
InboxChannelSchema.index({ brandId: 1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.InboxChannel) {
        delete mongoose.models.InboxChannel;
    }
}

const InboxChannel =
    mongoose.models.InboxChannel || mongoose.model<IInboxChannel>('InboxChannel', InboxChannelSchema);

export default InboxChannel;
