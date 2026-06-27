import mongoose, { Schema, Document, Model } from 'mongoose';

export type SocialPlatform =
    | 'telegram'
    | 'x'
    | 'linkedin'
    | 'reddit'
    | 'instagram'
    | 'facebook'
    | 'youtube'
    | 'google_business'
    | 'dribbble'
    | 'threads'
    | 'slack'
    | 'notion'
    | 'discord'
    | 'pinterest'
    | 'tiktok'
    | 'bluesky'
    | 'mastodon'
    | 'devto';

export interface ISocialAccount extends Document {
    brandId: string;
    platform: SocialPlatform;
    platformAccountId: string;   // Platform's user/page ID
    platformUsername: string;    // Display name (@username)
    platformDisplayName?: string; // Full display name
    avatarUrl?: string;

    // Encrypted credentials (AES-256-GCM)
    encryptedAccessToken: string;
    encryptedRefreshToken?: string;
    encryptedBotToken?: string;  // For Telegram bots
    tokenExpiresAt?: Date;

    // Metadata
    scopes: string[];            // Granted permissions
    isActive: boolean;
    /**
     * OAuth credential health (audit C6). `active` = usable; `expired` = token
     * refresh failed / no refresh token and the access token has expired;
     * `revoked` = the platform reported the grant was revoked.
     */
    connectionStatus: 'active' | 'expired' | 'revoked';
    /** Last time the token-refresh cron successfully validated/refreshed this account. */
    lastValidatedAt?: Date;
    lastUsedAt?: Date;
    lastError?: string;          // Store last error for debugging
    telegramChannels?: {          // For Telegram: channels/groups the bot can post to
        chatId: string;
        title: string;
        type: 'channel' | 'group' | 'supergroup';
        username?: string;
    }[];

    // Integration Specific Metadata
    slackMetadata?: {
        teamId: string;
        teamName: string;
        botUserId: string;
        incomingWebhookUrl?: string;
    };
    notionMetadata?: {
        workspaceId: string;
        workspaceName: string;
        botId: string;
    };
    discordMetadata?: {
        guildId: string;
        guildName: string;
    };
    pinterestMetadata?: {
        boards?: string[]; // IDs of boards
    };

    /**
     * Free-form per-platform metadata. TikTok Business stores `advertiserId`
     * here (required by the analytics fetcher).
     */
    metadata?: Record<string, unknown> & { advertiserId?: string };

    createdAt: Date;
    updatedAt: Date;
}

const SocialAccountSchema = new Schema<ISocialAccount>(
    {
        brandId: {
            type: String,
            required: true,
            index: true,
        },
        platform: {
            type: String,
            enum: [
                'telegram', 'x', 'linkedin', 'reddit', 'instagram', 'facebook',
                'youtube', 'google_business', 'dribbble', 'threads',
                'slack', 'notion', 'discord', 'pinterest', 'tiktok',
                'bluesky', 'mastodon', 'devto'
            ],
            required: true,
        },
        platformAccountId: {
            type: String,
            required: true,
        },
        platformUsername: {
            type: String,
            required: true,
        },
        platformDisplayName: {
            type: String,
            default: null,
        },
        avatarUrl: {
            type: String,
            default: null,
        },
        encryptedAccessToken: {
            type: String,
            required: true,
            select: false, // Don't include in queries by default for security
        },
        encryptedRefreshToken: {
            type: String,
            default: null,
            select: false,
        },
        encryptedBotToken: {
            type: String,
            default: null,
            select: false,
        },
        tokenExpiresAt: {
            type: Date,
            default: null,
        },
        scopes: {
            type: [String],
            default: [],
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        connectionStatus: {
            type: String,
            enum: ['active', 'expired', 'revoked'],
            default: 'active',
        },
        lastValidatedAt: {
            type: Date,
            default: null,
        },
        lastUsedAt: {
            type: Date,
            default: null,
        },
        lastError: {
            type: String,
            default: null,
        },
        telegramChannels: {
            type: [{
                chatId: { type: String, required: true },
                title: { type: String, required: true },
                type: { type: String, enum: ['channel', 'group', 'supergroup'], required: true },
                username: { type: String, default: null },
            }],
            default: [],
        },
        slackMetadata: {
            teamId: String,
            teamName: String,
            botUserId: String,
            incomingWebhookUrl: String,
        },
        notionMetadata: {
            workspaceId: String,
            workspaceName: String,
            botId: String,
        },
        discordMetadata: {
            guildId: String,
            guildName: String,
        },
        pinterestMetadata: {
            boards: [String],
        },
        metadata: {
            type: Schema.Types.Mixed,
            default: undefined,
        },
    },
    {
        timestamps: true,
        collection: 'social_accounts',
    }
);

// Indexes
SocialAccountSchema.index({ brandId: 1, platform: 1 });
SocialAccountSchema.index({ platform: 1, platformAccountId: 1 }, { unique: true }); // Prevent duplicate connections

// Prevent model recompilation in development
const SocialAccount: Model<ISocialAccount> =
    mongoose.models.SocialAccount || mongoose.model<ISocialAccount>('SocialAccount', SocialAccountSchema);

export default SocialAccount;
