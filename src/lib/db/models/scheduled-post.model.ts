import mongoose, { Schema, Document, Model } from 'mongoose';

export type ScheduledPostStatus =
    | 'pending_approval'
    | 'scheduled'
    | 'publishing'
    | 'published'
    | 'failed'
    | 'cancelled';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly';

export interface IPublishResult {
    platform: string;
    accountId: string;
    success: boolean;
    postId?: string;
    postUrl?: string;
    error?: string;
    publishedAt?: Date;
}

export interface IPlatformConfig {
    accountId: string;
    platform: string;
    platformUsername: string;
    // Platform-specific options
    telegramChatIds?: string[];        // For Telegram: which channels to post to
    redditSubreddit?: string;          // For Reddit: target subreddit
    redditTitle?: string;              // For Reddit: post title
    pinterestBoardId?: string;         // For Pinterest: target board
    instagramFirstComment?: string;    // For Instagram: first comment (legacy, platform-specific)
    isThread?: boolean;                // For X/Threads: is this a thread?
    threadParts?: string[];            // For X/Threads/Mastodon/Bluesky: thread content parts
    firstComment?: string;             // Generic first-comment (any comment-capable platform)
    /**
     * Per-platform advanced settings (audit Epic 1.5). Free-form blob validated
     * per-provider via its settings schema — e.g. TikTok { privacy_level, duet },
     * YouTube { title, privacy, madeForKids, tags }, Reddit { flairId },
     * Pinterest { link, dominantColor }, X { whoCanReply }.
     */
    settings?: Record<string, unknown>;
}

export interface IRecurrence {
    frequency: RecurrenceFrequency;
    interval: number;                  // Every N days/weeks/months
    endDate?: Date;                    // When to stop recurring
    daysOfWeek?: number[];             // For weekly: 0=Sun, 1=Mon, etc.
    dayOfMonth?: number;               // For monthly: which day
}

export interface IScheduledPost extends Document {
    brandId: string;
    userId: string;
    // Content
    content: string;
    mediaUrls: string[];
    mediaTypes: ('image' | 'video')[];
    altText?: string;                   // Accessibility
    postFormat?: 'standard' | 'reel';

    // Platform configurations
    platforms: IPlatformConfig[];

    // Scheduling
    scheduledFor: Date;
    timezone: string;
    status: ScheduledPostStatus;

    // Recurrence (optional)
    recurrence?: IRecurrence;
    parentPostId?: string;              // For recurring: reference to original
    sourceDraftId?: string;

    // Results
    publishResults: IPublishResult[];
    lastAttemptAt?: Date;
    attemptCount: number;

    // Metadata
    createdAt: Date;
    updatedAt: Date;
}

const PublishResultSchema = new Schema<IPublishResult>(
    {
        platform: { type: String, required: true },
        accountId: { type: String, required: true },
        success: { type: Boolean, required: true },
        postId: { type: String, default: null },
        postUrl: { type: String, default: null },
        error: { type: String, default: null },
        publishedAt: { type: Date, default: null },
    },
    { _id: false }
);

const PlatformConfigSchema = new Schema<IPlatformConfig>(
    {
        accountId: { type: String, required: true },
        platform: { type: String, required: true },
        platformUsername: { type: String, required: true },
        telegramChatIds: { type: [String], default: undefined },
        redditSubreddit: { type: String, default: null },
        redditTitle: { type: String, default: null },
        pinterestBoardId: { type: String, default: null },
        instagramFirstComment: { type: String, default: null },
        isThread: { type: Boolean, default: false },
        threadParts: { type: [String], default: undefined },
        firstComment: { type: String, default: null },
        settings: { type: Schema.Types.Mixed, default: undefined },
    },
    { _id: false }
);

const RecurrenceSchema = new Schema<IRecurrence>(
    {
        frequency: {
            type: String,
            enum: ['daily', 'weekly', 'monthly'],
            required: true
        },
        interval: { type: Number, default: 1, min: 1 },
        endDate: { type: Date, default: null },
        daysOfWeek: { type: [Number], default: undefined },
        dayOfMonth: { type: Number, default: null, min: 1, max: 31 },
    },
    { _id: false }
);

const ScheduledPostSchema = new Schema<IScheduledPost>(
    {
        brandId: {
            type: String,
            required: true,
            index: true,
        },
        userId: {
            type: String,
            required: true,
            index: true,
        },
        content: {
            type: String,
            required: true,
        },
        mediaUrls: {
            type: [String],
            default: [],
        },
        mediaTypes: {
            type: [String],
            default: [],
        },
        altText: {
            type: String,
            default: null,
        },
        postFormat: {
            type: String,
            enum: ['standard', 'reel'],
            default: 'standard',
        },
        platforms: {
            type: [PlatformConfigSchema],
            required: true,
            validate: {
                validator: (v: IPlatformConfig[]) => v.length > 0,
                message: 'At least one platform must be selected',
            },
        },
        scheduledFor: {
            type: Date,
            required: true,
            index: true,
        },
        timezone: {
            type: String,
            required: true,
            default: 'UTC',
        },
        status: {
            type: String,
            enum: ['pending_approval', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'],
            default: 'scheduled',
            index: true,
        },
        recurrence: {
            type: RecurrenceSchema,
            default: null,
        },
        parentPostId: {
            type: String,
            default: null,
            index: true,
        },
        sourceDraftId: {
            type: String,
            default: null,
            index: true,
        },
        publishResults: {
            type: [PublishResultSchema],
            default: [],
        },
        lastAttemptAt: {
            type: Date,
            default: null,
        },
        attemptCount: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
        collection: 'scheduled_posts',
    }
);

// Indexes for efficient querying
ScheduledPostSchema.index({ brandId: 1, status: 1 });
ScheduledPostSchema.index({ scheduledFor: 1, status: 1 }); // For finding due posts
ScheduledPostSchema.index({ userId: 1, createdAt: -1 });
ScheduledPostSchema.index({ status: 1, scheduledFor: 1 }); // Org-scoped scheduling queries (audit §6)

const existingScheduledPostModel = mongoose.models.ScheduledPost as Model<IScheduledPost> | undefined;

if (existingScheduledPostModel && !existingScheduledPostModel.schema.path('sourceDraftId')) {
    existingScheduledPostModel.schema.add({
        sourceDraftId: {
            type: String,
            default: null,
            index: true,
        },
    });
}

// Prevent model recompilation in development while allowing schema evolution
const ScheduledPost: Model<IScheduledPost> =
    existingScheduledPostModel ||
    mongoose.model<IScheduledPost>('ScheduledPost', ScheduledPostSchema);

export default ScheduledPost;
