import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPlanFeatures {
    // General Platform Features
    aiGeneration: boolean;
    customBranding: boolean;
    analytics: boolean;
    prioritySupport: boolean;
    apiAccess: boolean;
    teamCollaboration: boolean;

    // CRM Features
    maxContacts: number;                  // Max contacts user can create
    maxDeals: number;                     // Max deals user can create
    maxPipelines: number;                 // Max custom pipelines
    maxCustomFields: number;              // Max custom fields across all entities
    allowEmailSync: boolean;              // Can sync email via IMAP
    allowCalendarSync: boolean;           // Can sync calendar events
    allowWebhooks: boolean;               // Can create webhooks for CRM events

    // WhatsApp Features
    maxWhatsAppAccounts: number;          // Max WhatsApp Business accounts
    maxWhatsAppConversations: number;     // Max active conversations (-1 = unlimited)
    maxWhatsAppCampaigns: number;         // Max campaigns per month
    maxWhatsAppTemplates: number;         // Max message templates
    allowWhatsAppAutomation: boolean;     // Can use WhatsApp workflows

    // Forms Features
    maxForms: number;                     // Max forms user can create
    maxFormSubmissions: number;           // Max submissions per form (-1 = unlimited)
    allowFormEmbedding: boolean;          // Can embed forms on external sites
    allowFormNotifications: boolean;      // Can receive email notifications
    allowFormConditionalLogic: boolean;   // Can use conditional field logic

    // Docs Features
    maxDocuments: number;                 // Max documents user can create
    allowPublicPublishing: boolean;       // Can publish docs publicly
    allowDocCollaboration: boolean;       // Can share docs with team members
    allowDocVersionHistory: boolean;      // Can access version history

    // AI Studio Features
    maxConversations: number;             // Max AI conversations
    maxMessagesPerConversation: number;   // Max messages per conversation (-1 = unlimited)
    allowedAIProviders: string[];         // Which AI providers user can access

    // Canvas/Workflows Features
    maxCanvases: number;                  // Max canvas/workflow automations
    maxWorkflowExecutions: number;        // Max executions per month (-1 = unlimited)
    allowAdvancedNodes: boolean;          // Can use advanced workflow nodes
    allowAIWorkflowGeneration: boolean;   // Can use AI to generate workflows

    // Workflow Queue Fairness (audit C1 — per-org queue isolation, fully plan-driven)
    maxConcurrentExecutions: number;      // Max workflow jobs an org may run in parallel on the worker (-1 = unlimited)
    maxQueuedExecutions: number;          // Max workflow jobs an org may have waiting/delayed at once (-1 = unlimited)
    executionPriority: number;            // BullMQ priority for this org's jobs. LOWER = HIGHER priority (1 is highest; 0 = no priority/FIFO). Bulk/fan-out runs add an offset so interactive runs jump ahead.

    // Execution History Retention (audit H4 — plan-driven prune windows, super-admin controlled)
    executionRetentionDays: number;       // Days to keep terminal non-failed executions (completed/cancelled). -1 = keep forever
    failedExecutionRetentionDays: number; // Days to keep FAILED executions (usually longer for debugging). -1 = keep forever
    maxStoredExecutions: number;          // Hard per-org cap on retained terminal executions (oldest pruned beyond this). -1 = no cap

    // Marketing Email Features
    maxEmailCampaigns: number;            // Max email campaigns per month
    maxEmailTemplates: number;            // Max email templates
    allowEmailAutomation: boolean;        // Can use email automation workflows

    // Social Media Features (existing)
    maxBrands: number;                    // Max brands user can create
    maxSocialAccountsPerBrand: number;    // Max accounts per brand
    allowedPlatforms: string[];           // Which platforms user can connect

    // Social Media Features (audit C9 2026-06-06 — plan-driven operational caps, -1 = unlimited)
    allowApprovalWorkflow: boolean;       // Org may use the social approval workflow (gates the org-level policy — audit C8)
    maxScheduledPostsPerMonth: number;    // Max posts scheduled/published per calendar month (-1 = unlimited)
    maxPostsPerDay: number;               // Max posts scheduled/published per calendar day (-1 = unlimited)
    maxDraftsPerBrand: number;            // Max drafts per brand (-1 = unlimited)
    maxPostTemplates: number;             // Max post templates per org (-1 = unlimited)
    maxMediaStorageMb: number;            // Media library storage cap in MB (-1 = unlimited)
    allowBulkPublishing: boolean;         // Can use the bulk CSV planner
    allowSocialAI: boolean;               // Can use social AI endpoints (enhance/ideas/hashtags/repurpose/translate)
    maxSocialAIGenerationsPerMonth: number; // Max social AI generations per calendar month (-1 = unlimited)
    allowAiVideo: boolean;                // Can use the AI slideshow→video generator (script→images→TTS→MP4)
    allowWhiteLabel: boolean;             // Agency white-label reporting (paid; branding changes require super-admin approval)

    // AI Model Access Control (existing)
    allowedModelTiers: string[];          // ['free', 'pro', 'enterprise']
    allowedModelTypes: string[];          // ['text', 'image', 'video']

    // BYOK (Bring Your Own Key) (existing)
    allowByok: boolean;                   // Can user add their own API keys
    byokProviders: string[];              // Which providers user can bring keys for

    // Credits (existing)
    monthlyCredits: number;               // Credits allocated each billing cycle

    // Custom Models (existing)
    allowCustomOpenRouterModels: boolean; // Can use admin-added custom models

    // Voice Features
    allowVoice: boolean;                 // Master gate — false on free tier
    allowVoiceByok: boolean;             // Allow user-scoped credentials
    maxVoiceMinutes: number;             // Per month (-1 = unlimited). BYOK bypasses this.
    allowedVoiceProviders: string[];     // ['twilio'] | ['twilio', 'plivo'] etc.

    // Agent Features (B1-0.6)
    agent: {
        allowAgent: boolean;                                    // Master gate — false on free tier
        allowedModels: string[];                                // e.g. ['claude-haiku-4-5', 'claude-sonnet-4-6']
        defaultModel: string;                                   // Must be in allowedModels; default 'claude-haiku-4-5'
        routerModel: string;                                    // Intent classification model; default 'claude-haiku-4-5'
        maxTokensUsdCents: number;                              // Per mission budget cap, e.g. 100 = $1.00
        maxToolCalls: number;                                   // Per mission tool-call cap
        maxWallClockHours: number;                              // Per mission wall-clock cap
        allowedAutonomyModes: ('watch' | 'supervised' | 'autopilot')[];
        defaultAutonomyMode: 'watch' | 'supervised' | 'autopilot';
        // Long-horizon autonomy (D3 2026-06-05) — super-admin editable per plan.
        maxActiveSchedules: number;                             // Agent-created scheduled tasks + triggers per brand (0 = none, -1 = unlimited)
        minWakeIntervalMinutes: number;                         // Floor for hibernating-mission wake cadence (1440 = daily, 60 = hourly)
        // Ads write gate (A3 2026-06-06) — paid-tier feature; false = agent can
        // read ads data but create_ad_campaign is blocked even with approval.
        allowAdsWrite: boolean;
    };
}

export interface IPlan extends Document {
    name: string;
    displayName: string;
    description: string;
    price: number;
    currency: string;
    billingInterval: 'monthly' | 'yearly' | 'lifetime';
    features: IPlanFeatures;
    status: 'active' | 'inactive';
    stripeProductId?: string;
    stripePriceId?: string;
    razorpayPlanId?: string;
    createdAt: Date;
    updatedAt: Date;
}

const PlanFeaturesSchema = new Schema<IPlanFeatures>({
    // General Platform Features
    aiGeneration: { type: Boolean, default: false },
    customBranding: { type: Boolean, default: false },
    analytics: { type: Boolean, default: false },
    prioritySupport: { type: Boolean, default: false },
    apiAccess: { type: Boolean, default: false },
    teamCollaboration: { type: Boolean, default: false },

    // CRM Features
    maxContacts: { type: Number, default: 100 },
    maxDeals: { type: Number, default: 20 },
    maxPipelines: { type: Number, default: 1 },
    maxCustomFields: { type: Number, default: 5 },
    allowEmailSync: { type: Boolean, default: false },
    allowCalendarSync: { type: Boolean, default: false },
    allowWebhooks: { type: Boolean, default: false },

    // WhatsApp Features
    maxWhatsAppAccounts: { type: Number, default: 1 },
    maxWhatsAppConversations: { type: Number, default: 50 },
    maxWhatsAppCampaigns: { type: Number, default: 5 },
    maxWhatsAppTemplates: { type: Number, default: 10 },
    allowWhatsAppAutomation: { type: Boolean, default: false },

    // Forms Features
    maxForms: { type: Number, default: 5 },
    maxFormSubmissions: { type: Number, default: 100 }, // per form
    allowFormEmbedding: { type: Boolean, default: true },
    allowFormNotifications: { type: Boolean, default: true },
    allowFormConditionalLogic: { type: Boolean, default: false },

    // Docs Features
    maxDocuments: { type: Number, default: 10 },
    allowPublicPublishing: { type: Boolean, default: true },
    allowDocCollaboration: { type: Boolean, default: false },
    allowDocVersionHistory: { type: Boolean, default: false },

    // AI Studio Features
    maxConversations: { type: Number, default: 10 },
    maxMessagesPerConversation: { type: Number, default: 50 },
    allowedAIProviders: {
        type: [String],
        default: ['openai', 'google'] // Free tier gets basic providers
    },


    // Canvas/Workflows Features
    maxCanvases: { type: Number, default: 5 },
    maxWorkflowExecutions: { type: Number, default: 100 }, // per month
    allowAdvancedNodes: { type: Boolean, default: false },
    allowAIWorkflowGeneration: { type: Boolean, default: false },

    // Workflow Queue Fairness (audit C1). Conservative free-tier defaults; lower
    // executionPriority = served first (BullMQ convention).
    maxConcurrentExecutions: { type: Number, default: 2 },   // free: 2 parallel jobs
    maxQueuedExecutions: { type: Number, default: 200 },     // free: 200 waiting/delayed
    executionPriority: { type: Number, default: 10 },        // free: lowest of the seeded tiers

    // Execution History Retention (audit H4). Conservative free-tier defaults;
    // -1 keeps forever (legacy plans without these fields are unaffected by the pruner).
    executionRetentionDays: { type: Number, default: 30 },        // free: 30 days for completed/cancelled
    failedExecutionRetentionDays: { type: Number, default: 90 },  // free: keep failures longer for debugging
    maxStoredExecutions: { type: Number, default: 5000 },         // free: hard cap on retained terminal rows

    // Marketing Email Features
    maxEmailCampaigns: { type: Number, default: 5 },
    maxEmailTemplates: { type: Number, default: 10 },
    allowEmailAutomation: { type: Boolean, default: false },

    // Social Media Features
    maxBrands: { type: Number, default: 1 },
    maxSocialAccountsPerBrand: { type: Number, default: 3 },
    allowedPlatforms: {
        type: [String],
        default: ['x', 'linkedin'] // Free tier gets basic platforms
    },

    // Social Media Features (audit C9). Conservative free-tier defaults; -1 = unlimited.
    allowApprovalWorkflow: { type: Boolean, default: false },     // approval workflow = paid tier
    maxScheduledPostsPerMonth: { type: Number, default: 30 },
    maxPostsPerDay: { type: Number, default: 5 },
    maxDraftsPerBrand: { type: Number, default: 20 },
    maxPostTemplates: { type: Number, default: 10 },
    maxMediaStorageMb: { type: Number, default: 250 },
    allowBulkPublishing: { type: Boolean, default: false },
    allowSocialAI: { type: Boolean, default: true },
    maxSocialAIGenerationsPerMonth: { type: Number, default: 50 },
    allowAiVideo: { type: Boolean, default: false },      // AI slideshow→video = paid tier
    allowWhiteLabel: { type: Boolean, default: false },   // white-label reporting = paid tier (agencies)

    // AI Model Access Control
    allowedModelTiers: {
        type: [String],
        default: ['free'] // Free tier by default
    },
    allowedModelTypes: {
        type: [String],
        default: ['text', 'image'] // Text and image by default
    },

    // BYOK
    allowByok: { type: Boolean, default: false },
    byokProviders: {
        type: [String],
        default: []
    },

    // Credits
    monthlyCredits: { type: Number, default: 100 }, // 100 credits for free tier

    // Custom Models
    allowCustomOpenRouterModels: { type: Boolean, default: false },

    // Voice Features (Q1, voice-open-questions 2026-05-22)
    allowVoice: { type: Boolean, default: false },
    allowVoiceByok: { type: Boolean, default: false },
    maxVoiceMinutes: { type: Number, default: 0 }, // 0 = none, -1 = unlimited
    allowedVoiceProviders: {
        type: [String],
        default: [],
    },

    // Agent Features (B1-0.6)
    agent: {
        type: new Schema({
            allowAgent: { type: Boolean, default: false },
            allowedModels: { type: [String], default: ['claude-haiku-4-5-20251001'] },
            defaultModel: { type: String, default: 'claude-haiku-4-5-20251001' },
            routerModel: { type: String, default: 'claude-haiku-4-5-20251001' },
            maxTokensUsdCents: { type: Number, default: 50 },   // $0.50 per mission
            maxToolCalls: { type: Number, default: 25 },
            maxWallClockHours: { type: Number, default: 1 },
            allowedAutonomyModes: { type: [String], default: ['watch'] },
            defaultAutonomyMode: { type: String, default: 'watch' },
            maxActiveSchedules: { type: Number, default: 0 },       // 0 = no agent self-scheduling (Free)
            minWakeIntervalMinutes: { type: Number, default: 1440 },// daily floor by default
            allowAdsWrite: { type: Boolean, default: false },       // ads campaign creation = paid tier (A3)
        }, { _id: false }),
        default: () => ({}),
    },
}, { _id: false });

const PlanSchema = new Schema<IPlan>(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        displayName: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            default: '',
        },
        price: {
            type: Number,
            required: [true, 'Please provide the plan price'],
            min: [0, 'Price cannot be negative']
        },
        currency: {
            type: String,
            default: 'INR'
        },
        billingInterval: {
            type: String,
            enum: ['monthly', 'yearly', 'lifetime'],
            default: 'monthly',
        },
        features: {
            type: PlanFeaturesSchema,
            default: () => ({}),
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
        },
        stripeProductId: {
            type: String,
            default: null,
        },
        stripePriceId: {
            type: String,
            default: null,
        },
        razorpayPlanId: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'plans',
    }
);

// Indexes

PlanSchema.index({ status: 1 });

// Prevent model recompilation in development
const Plan: Model<IPlan> =
    mongoose.models.Plan || mongoose.model<IPlan>('Plan', PlanSchema);

export default Plan;
