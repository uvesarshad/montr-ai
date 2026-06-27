/**
 * Canvas Node Registry — Single Source of Truth
 *
 * This file defines every node type available in the canvas editor.
 * It is used by:
 * - The AI workflow generator API (prompt construction & validation)
 * - The node-collection dialog (future)
 * - Any system that needs to know what nodes exist
 */

// =============================================================================
// TYPES
// =============================================================================

export type NodeCategory =
    | 'triggers'
    | 'data_sources'
    | 'social_media'
    | 'ai'
    | 'actions'
    | 'logic'
    | 'output'
    | 'utility'
    | 'integrations';

export interface NodeDataField {
    /** Field name in node.data */
    name: string;
    /** TypeScript type */
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    /** Whether the field is required for a valid node */
    required: boolean;
    /** Human-readable description */
    description: string;
    /** Example value for AI generation */
    example?: string | number | boolean;
}

/**
 * Engine mapping for a node: tells the execution engine which processor key
 * to use. Canvas node `type` → engine `{ category, subType }` is the bridge
 * between the React Flow palette and the UnifiedWorkflowExecutionEngine.
 *
 * subType must match either:
 *  - a key in NodeProcessorRegistry (so the registry handles it), or
 *  - an inline handler name in UnifiedWorkflowExecutionEngine, or
 *  - be marked skipInExecution: true (sticky notes, empty group shells).
 */
export type EngineCategory =
    | 'trigger'
    | 'action'
    | 'logic'
    | 'ai'
    | 'data'
    | 'integration'
    | 'control';

export interface NodeEngineMapping {
    category: EngineCategory;
    subType: string;
    /** When true, this node is stripped from the workflow graph before execution. */
    skipInExecution?: boolean;
}

export interface NodeRegistryEntry {
    /** The exact React Flow node type key (must match nodeTypes in canvas-editor.tsx) */
    type: string;
    /** Category for grouping */
    category: NodeCategory;
    /** Human-readable name */
    name: string;
    /** What this node does */
    description: string;
    /** Data fields the AI should populate */
    dataFields: NodeDataField[];
    /** Whether this node has an input handle (target) */
    hasInput: boolean;
    /** Whether this node has an output handle (source) */
    hasOutput: boolean;
}

// =============================================================================
// NODE REGISTRY
// =============================================================================

export const NODE_REGISTRY: NodeRegistryEntry[] = [
    // ─────────────────────────────────────────────────────────────────────────────
    // TRIGGERS — Starting points for workflows
    // ─────────────────────────────────────────────────────────────────────────────
    {
        type: 'triggerManual',
        category: 'triggers',
        name: 'Manual Trigger',
        description: 'Manually start the workflow with a button click. Use as the starting point for user-initiated workflows.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Button label', example: 'Start' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerSchedule',
        category: 'triggers',
        name: 'Schedule Trigger',
        description: 'Runs the workflow on a time-based schedule (cron). Use for automated recurring tasks.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Daily at 9 AM' },
            { name: 'cron', type: 'string', required: false, description: 'Cron expression', example: '0 9 * * *' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerWebhook',
        category: 'triggers',
        name: 'Webhook Trigger',
        description: 'Receives HTTP POST requests to trigger the workflow. Use for external integrations.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Webhook' },
            { name: 'method', type: 'string', required: false, description: 'HTTP method', example: 'POST' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerIntegrationWebhook',
        category: 'triggers',
        name: 'Integration Event Trigger',
        description: 'Triggers when a connected app (Shopify, RevenueCat, Calendly, Stripe) sends a webhook event, e.g. a new order, meeting booked, or payment received.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Shopify Order' },
            { name: 'provider', type: 'string', required: false, description: 'Provider: shopify, revenuecat, calendly or stripe', example: 'shopify' },
            { name: 'topics', type: 'string', required: false, description: 'Comma-separated topic filter (empty = all)', example: 'orders/create' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerAdLead',
        category: 'triggers',
        name: 'Ad Lead Captured Trigger',
        description: 'Triggers when a lead is captured from Meta Lead Ads or Google lead forms. Fires after the automatic CRM intake, so the payload includes the contact and sync status.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'New ad lead' },
            { name: 'platform', type: 'string', required: false, description: 'meta_ads or google_ads (empty = all)', example: 'meta_ads' },
            { name: 'formId', type: 'string', required: false, description: 'Comma-separated form-ID filter (empty = all)', example: '1234567890' },
            { name: 'campaignId', type: 'string', required: false, description: 'Comma-separated campaign-ID filter (empty = all)', example: '23850000000000000' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerFormSubmission',
        category: 'triggers',
        name: 'Form Submission Trigger',
        description: 'Triggers when a hosted/public form is submitted. Fires after the submission is saved (and after CRM intake), so the payload includes the form fields and the matched contact.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Contact form' },
            { name: 'formId', type: 'string', required: false, description: 'Comma-separated form-ID filter (empty = all forms)', example: '665f0c...' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerPolling',
        category: 'triggers',
        name: 'When a new row/email/record appears',
        description: 'Periodically checks an app for new items and runs the workflow for each one. Use for apps without webhooks: new Gmail email, new Google Sheets row, or new RSS feed item.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'New email arrives' },
            { name: 'pollSource', type: 'string', required: true, description: 'gmail_new_email | sheets_new_row | rss_new_item', example: 'rss_new_item' },
            { name: 'intervalMinutes', type: 'number', required: false, description: 'How often to check, in minutes (min 5, default 15)', example: '15' },
            { name: 'connectionId', type: 'string', required: false, description: 'Credential name holding the Google OAuth token (Gmail/Sheets)', example: 'google' },
            { name: 'spreadsheetId', type: 'string', required: false, description: 'Google Sheets spreadsheet ID (sheets source)', example: '1AbC...' },
            { name: 'sheetName', type: 'string', required: false, description: 'Sheet/tab name (sheets source)', example: 'Sheet1' },
            { name: 'feedUrl', type: 'string', required: false, description: 'RSS/Atom feed URL (rss source)', example: 'https://example.com/feed.xml' },
            { name: 'gmailQuery', type: 'string', required: false, description: 'Optional Gmail search query (gmail source)', example: 'from:billing' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerAdsWeeklySummary',
        category: 'triggers',
        name: 'Ads Weekly Summary Trigger',
        description: 'Fires once a week with computed spend/clicks/conversions across connected ad accounts. Use to send a weekly performance recap to your team.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Weekly ads recap' },
            { name: 'brandId', type: 'string', required: false, description: 'Optional brand filter (empty = whole organization)', example: '' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerAdsBudgetThreshold',
        category: 'triggers',
        name: 'Ads Budget Threshold Trigger',
        description: 'Fires when paid spend pacing crosses a threshold (a large week-over-week swing). Use to alert the team when budgets run hot or cold.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Spend pacing alert' },
            { name: 'brandId', type: 'string', required: false, description: 'Optional brand filter (empty = whole organization)', example: '' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerAdsPerformanceAnomaly',
        category: 'triggers',
        name: 'Ads Performance Anomaly Trigger',
        description: 'Fires when a week-over-week spend swing breaches the anomaly band. Use to notify the team when something unusual happens with paid performance.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Ads anomaly' },
            { name: 'brandId', type: 'string', required: false, description: 'Optional brand filter (empty = whole organization)', example: '' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerWhatsApp',
        category: 'triggers',
        name: 'WhatsApp Trigger',
        description: 'Triggers on incoming WhatsApp messages. Supports keyword and contact group filters.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'WhatsApp' },
            { name: 'triggerType', type: 'string', required: false, description: 'Trigger condition: any_message, keyword, contact_group', example: 'any_message' },
            { name: 'keywordFilter', type: 'string', required: false, description: 'Keyword filter (comma-separated)', example: 'order,help' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerEmail',
        category: 'triggers',
        name: 'Email Trigger',
        description: 'Triggers on incoming email. Supports Gmail and Outlook with subject, sender, and label filters.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Email' },
            { name: 'provider', type: 'string', required: false, description: 'Email provider: gmail or outlook', example: 'gmail' },
            { name: 'filterType', type: 'string', required: false, description: 'Filter type: any, subject, sender, label', example: 'any' },
            { name: 'filterValue', type: 'string', required: false, description: 'Filter value', example: 'invoice' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerSocial',
        category: 'triggers',
        name: 'Social Media Trigger',
        description: 'Triggers on social media events: mentions, comments, DMs, new followers, likes. Supports Instagram, LinkedIn, X, Facebook.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Social' },
            { name: 'platforms', type: 'array', required: false, description: 'Platforms to monitor', example: 'instagram,linkedin' },
            { name: 'eventType', type: 'string', required: false, description: 'Event type: mention, comment, dm, follower, like', example: 'mention' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerKeyword',
        category: 'triggers',
        name: 'Keyword Trigger',
        description: 'Monitors web, social media, and news for specific keywords. Triggers when a match is found.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Keywords' },
            { name: 'keywords', type: 'array', required: true, description: 'Keywords to track', example: 'brand name,competitor' },
            { name: 'sources', type: 'array', required: false, description: 'Sources to monitor: web, social, news', example: 'web,social' },
            { name: 'checkFrequency', type: 'string', required: false, description: 'Check interval', example: '1h' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerTelegram',
        category: 'triggers',
        name: 'Telegram Trigger',
        description: 'Triggers on incoming Telegram messages to your bot. Supports text, keyword, and media filters.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Telegram Bot Trigger' },
            { name: 'triggerType', type: 'string', required: false, description: 'Trigger condition', example: 'any_message' },
            { name: 'keywordFilter', type: 'string', required: false, description: 'Keyword filter', example: '/start, help' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    // ─────────────────────────────────────────────────────────────────────────────
    // CRM TRIGGERS — fire on CRM record events (matched by the trigger dispatcher)
    // ─────────────────────────────────────────────────────────────────────────────
    {
        type: 'triggerRecordCreated',
        category: 'triggers',
        name: 'CRM Record Created',
        description: 'Triggers when a CRM record is created. Optionally scope to a specific entity type.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'New Contact' },
            { name: 'entityType', type: 'string', required: false, description: 'Entity type: contact, company, deal, activity (empty = any)', example: 'contact' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerRecordUpdated',
        category: 'triggers',
        name: 'CRM Record Updated',
        description: 'Triggers when a CRM record is updated. Optionally scope to a specific entity type.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Contact Updated' },
            { name: 'entityType', type: 'string', required: false, description: 'Entity type: contact, company, deal, activity (empty = any)', example: 'contact' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerRecordDeleted',
        category: 'triggers',
        name: 'CRM Record Deleted',
        description: 'Triggers when a CRM record is deleted. Optionally scope to a specific entity type.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Contact Deleted' },
            { name: 'entityType', type: 'string', required: false, description: 'Entity type: contact, company, deal, activity (empty = any)', example: 'contact' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerFieldChanged',
        category: 'triggers',
        name: 'CRM Field Changed',
        description: 'Triggers when a specific field on a CRM record changes. Optionally match from/to values.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Status Changed' },
            { name: 'entityType', type: 'string', required: false, description: 'Entity type: contact, company, deal, activity (empty = any)', example: 'contact' },
            { name: 'field', type: 'string', required: true, description: 'Field name to watch', example: 'status' },
            { name: 'fromValue', type: 'string', required: false, description: 'Only fire when changing FROM this value', example: 'lead' },
            { name: 'toValue', type: 'string', required: false, description: 'Only fire when changing TO this value', example: 'customer' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerStageChanged',
        category: 'triggers',
        name: 'Deal Stage Changed',
        description: 'Triggers when a deal moves to a new pipeline stage. Optionally scope to a specific stage.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Stage Changed' },
            { name: 'stageId', type: 'string', required: false, description: 'Only fire when moved to this stage (empty = any)', example: '' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerDealWon',
        category: 'triggers',
        name: 'Deal Won',
        description: 'Triggers when a deal is marked as won.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Deal Won' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerDealLost',
        category: 'triggers',
        name: 'Deal Lost',
        description: 'Triggers when a deal is marked as lost.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Deal Lost' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerTagAdded',
        category: 'triggers',
        name: 'Tag Added',
        description: 'Triggers when a tag is added to a CRM record. Optionally scope to a specific tag.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Tag Added' },
            { name: 'tagId', type: 'string', required: false, description: 'Only fire for this tag (empty = any)', example: '' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerTagRemoved',
        category: 'triggers',
        name: 'Tag Removed',
        description: 'Triggers when a tag is removed from a CRM record. Optionally scope to a specific tag.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Tag Removed' },
            { name: 'tagId', type: 'string', required: false, description: 'Only fire for this tag (empty = any)', example: '' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerTaskCompleted',
        category: 'triggers',
        name: 'Task Completed',
        description: 'Triggers when a CRM task is completed.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Task Completed' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    {
        type: 'triggerManualCrm',
        category: 'triggers',
        name: 'Manual: CRM records',
        description: 'Makes the workflow runnable on demand from CRM record lists (single record or bulk selection). Drop this to let users trigger the workflow from the contacts, companies, or deals tables.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Trigger label', example: 'Manual: CRM records' },
            { name: 'entityType', type: 'string', required: true, description: 'Entity type: contact, company, deal', example: 'contact' },
            { name: 'availability', type: 'string', required: false, description: "Where it can run: 'single', 'bulk', or 'both'", example: 'both' },
        ],
        hasInput: false,
        hasOutput: true,
    },
    // ─────────────────────────────────────────────────────────────────────────────
    // DATA SOURCES — Input data for the workflow
    // ─────────────────────────────────────────────────────────────────────────────
    {
        type: 'textInput',
        category: 'data_sources',
        name: 'Text Input',
        description: 'Static text content that can be passed to other nodes. Use for providing prompts, templates, or content.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Input Text' },
            { name: 'text', type: 'string', required: false, description: 'Text content', example: 'Write a blog post about...' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'imageNode',
        category: 'data_sources',
        name: 'Image',
        description: 'Upload or reference an image. Passes image data to connected nodes.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Product Photo' },
            { name: 'url', type: 'string', required: false, description: 'Image URL', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'fileNode',
        category: 'data_sources',
        name: 'File',
        description: 'Upload and process files (PDF, CSV, etc). Extracts content for downstream nodes.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Upload File' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'websiteNode',
        category: 'data_sources',
        name: 'Website',
        description: 'Scrape content from a website URL. Extracts text for AI processing.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Scrape Website' },
            { name: 'url', type: 'string', required: false, description: 'Website URL to scrape', example: 'https://example.com' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'youtubeNode',
        category: 'data_sources',
        name: 'YouTube',
        description: 'Extract transcript and metadata from a YouTube video URL.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'YouTube Video' },
            { name: 'url', type: 'string', required: false, description: 'YouTube video URL', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'audioNode',
        category: 'data_sources',
        name: 'Audio',
        description: 'Transcribe audio content to text using AI.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Audio Transcription' },
        ],
        hasInput: true,
        hasOutput: true,
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // SOCIAL MEDIA — Platform-specific content nodes
    // ─────────────────────────────────────────────────────────────────────────────
    {
        type: 'instagramNode',
        category: 'social_media',
        name: 'Instagram',
        description: 'Fetch Instagram post media + captions via the Meta Graph API (official API, not page scraping).',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Instagram Post' },
            { name: 'url', type: 'string', required: false, description: 'Instagram post URL', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'linkedinNode',
        category: 'social_media',
        name: 'LinkedIn',
        description: 'Fetch LinkedIn post content + engagement via the LinkedIn REST API (official API, not page scraping).',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'LinkedIn Post' },
            { name: 'url', type: 'string', required: false, description: 'LinkedIn post URL', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'xNode',
        category: 'social_media',
        name: 'X (Twitter)',
        description: 'Fetch X/Twitter post content + media via the X API v2 (official API, not page scraping).',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Tweet' },
            { name: 'url', type: 'string', required: false, description: 'Tweet URL', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'redditNode',
        category: 'social_media',
        name: 'Reddit',
        description: 'Process Reddit post content. Extracts post text, comments, and metadata.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Reddit Post' },
            { name: 'url', type: 'string', required: false, description: 'Reddit post URL', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'pinterestNode',
        category: 'social_media',
        name: 'Pinterest',
        description: 'Process Pinterest pin content. Extracts pin image and description.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Pinterest Pin' },
            { name: 'url', type: 'string', required: false, description: 'Pinterest pin URL', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // AI — AI-powered processing nodes
    // ─────────────────────────────────────────────────────────────────────────────
    {
        type: 'promptNode',
        category: 'ai',
        name: 'Generate Text',
        description: 'Generate text using an AI model. Takes a prompt and optional incoming context to produce AI-generated content.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Generate Blog Post' },
            { name: 'prompt', type: 'string', required: false, description: 'The prompt/instruction for the AI', example: 'Write a professional blog post about...' },
            { name: 'systemPrompt', type: 'string', required: false, description: 'System instruction for the AI', example: 'You are a professional content writer.' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'aiChatbot',
        category: 'ai',
        name: 'AI Chat',
        description: 'Interactive AI conversation node. Supports multi-turn chat with context from connected nodes.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'AI Assistant' },
            { name: 'systemPrompt', type: 'string', required: false, description: 'System prompt defining AI behavior', example: 'You are a helpful marketing assistant.' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'generateImage',
        category: 'ai',
        name: 'Generate Image',
        description: 'Create images using AI models (DALL-E, Imagen, Flux). Takes a text description and generates an image.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Generate Hero Image' },
            { name: 'prompt', type: 'string', required: false, description: 'Image description prompt', example: 'A modern office workspace with natural lighting' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'generateVideo',
        category: 'ai',
        name: 'Generate Video',
        description: 'Create videos using AI models (Veo). Takes a text description and generates a short video clip.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Generate Promo Video' },
            { name: 'prompt', type: 'string', required: false, description: 'Video description prompt', example: 'A product showcase animation' },
        ],
        hasInput: true,
        hasOutput: true,
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // ACTIONS — Perform operations / send data
    // ─────────────────────────────────────────────────────────────────────────────
    {
        type: 'actionWhatsApp',
        category: 'actions',
        name: 'Send WhatsApp',
        description: 'Send a WhatsApp message to a contact. Uses incoming content as the message body.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Send WhatsApp' },
            { name: 'message', type: 'string', required: false, description: 'Message template', example: 'Hello! Here is your update...' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'actionWhatsAppButtons',
        category: 'actions',
        name: 'WhatsApp Buttons',
        description: 'Send an interactive WhatsApp reply-button message (up to 3 buttons). Session message — requires an open 24h conversation window.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Ask to continue' },
            { name: 'bodyText', type: 'string', required: true, description: 'Body text shown above the buttons', example: 'Would you like to continue?' },
            { name: 'buttons', type: 'array', required: true, description: 'Reply buttons (id + title), max 3', example: '[{"id":"yes","title":"Yes"},{"id":"no","title":"No"}]' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'actionWhatsAppList',
        category: 'actions',
        name: 'WhatsApp List',
        description: 'Send an interactive WhatsApp list menu (sections + rows). Session message — requires an open 24h conversation window.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Pick an option' },
            { name: 'bodyText', type: 'string', required: true, description: 'Body text shown above the menu', example: 'Choose a service:' },
            { name: 'buttonLabel', type: 'string', required: false, description: 'Menu button label', example: 'View options' },
            { name: 'sections', type: 'array', required: true, description: 'List sections, each with rows (id + title + optional description)', example: '[{"title":"Services","rows":[{"id":"a","title":"Support"}]}]' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'actionSms',
        category: 'actions',
        name: 'Send SMS',
        description: 'Send an SMS via your Twilio voice number (e.g. WhatsApp 24h-window fallback). Resolves the destination from a CRM contact or an explicit number.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Send SMS' },
            { name: 'message', type: 'string', required: false, description: 'Message body template', example: 'Hi {{contact.firstName}}, your order shipped.' },
            { name: 'to', type: 'string', required: false, description: 'Explicit E.164 destination (overrides contact)', example: '+14155551234' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    // ── Voice flow-builder nodes ──────────────────────────────────────────────
    {
        type: 'voiceMakeCall',
        category: 'actions',
        name: 'Make Call',
        description: 'Place an outbound AI voice call to a contact or number. Start of a voice flow. Outputs { callSessionId, providerCallId, status }. Typically followed by a "voiceWaitOutcome" node to wait for the call to finish, then a "logicBranch" on the disposition. Pass its callSessionId to "voiceTransfer"/"voiceHangup".',
        dataFields: [
            { name: 'to', type: 'string', required: false, description: 'E.164 destination (overrides contact)', example: '+14155551234' },
            { name: 'contactId', type: 'string', required: false, description: 'CRM contact whose phone to dial', example: '{{trigger.record._id}}' },
            { name: 'from', type: 'string', required: false, description: 'Caller ID (else an owned number)', example: '+14155550000' },
            { name: 'aiBotId', type: 'string', required: false, description: 'AI bot that talks on the call', example: '' },
            { name: 'recordCall', type: 'boolean', required: false, description: 'Record the call', example: false },
            { name: 'machineDetection', type: 'boolean', required: false, description: 'Detect answering machines', example: false },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'voiceWaitOutcome',
        category: 'actions',
        name: 'Wait for Call Outcome',
        description: 'Pause the workflow until the call completes (or times out). Place it AFTER "voiceMakeCall". Outputs { matched, callSessionId, durationSec, disposition }. Follow with a "logicBranch" on {{nodes.<thisNode>.output.disposition}} — e.g. on "voicemail" or "no_answer" send a "voiceSendSms" follow-up; on "connected"/positive sentiment continue the flow.',
        dataFields: [
            { name: 'contactId', type: 'string', required: false, description: 'Contact to wait on (defaults to triggering contact)', example: '{{trigger.record._id}}' },
            { name: 'maxWaitSec', type: 'number', required: false, description: 'Max seconds to wait', example: 300 },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'voiceGatherDtmf',
        category: 'actions',
        name: 'Gather Keypad (DTMF)',
        description: 'Pause the workflow until the caller presses keypad digits during a live call (or it times out), then branch on the digits. Outputs { matched, digits, branch }. Wire labelled outbound edges whose sourceHandle is the digit (e.g. "1", "2") or "timeout" to route each choice — typical IVR menu.',
        dataFields: [
            { name: 'contactId', type: 'string', required: false, description: 'Contact on the call (defaults to triggering contact)', example: '{{trigger.record._id}}' },
            { name: 'maxWaitSec', type: 'number', required: false, description: 'Max seconds to wait for a keypress', example: 30 },
            { name: 'numDigits', type: 'number', required: false, description: 'How many digits to expect (informational)', example: 1 },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'voiceTransfer',
        category: 'actions',
        name: 'Transfer Call',
        description: 'Transfer a live call to a human/agent (warm conference or cold redirect).',
        dataFields: [
            { name: 'callSessionId', type: 'string', required: true, description: 'Call to transfer', example: '{{nodes.makeCall.output.callSessionId}}' },
            { name: 'to', type: 'string', required: true, description: 'Destination number / agent', example: '+14155550123' },
            { name: 'mode', type: 'string', required: false, description: 'warm | cold', example: 'warm' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'voiceHangup',
        category: 'actions',
        name: 'Hang Up',
        description: 'End a live call placed earlier in the flow.',
        dataFields: [
            { name: 'callSessionId', type: 'string', required: true, description: 'Call to end', example: '{{nodes.makeCall.output.callSessionId}}' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'voiceSendSms',
        category: 'actions',
        name: 'Send SMS (Voice)',
        description: 'Send an SMS from your voice number. Resolves the destination from a CRM contact or explicit number.',
        dataFields: [
            { name: 'to', type: 'string', required: false, description: 'Explicit E.164 destination (overrides contact)', example: '+14155551234' },
            { name: 'contactId', type: 'string', required: false, description: 'CRM contact to text', example: '{{trigger.record._id}}' },
            { name: 'message', type: 'string', required: false, description: 'Message body template', example: 'Hi {{contact.firstName}}, your order shipped.' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'actionMarketingEmail',
        category: 'actions',
        name: 'Marketing Email',
        description: 'Send bulk marketing emails to a contact list. Uses incoming content as email body.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Send Newsletter' },
            { name: 'subject', type: 'string', required: false, description: 'Email subject line', example: 'Your Weekly Update' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'actionConversationalEmail',
        category: 'actions',
        name: 'Conversational Email',
        description: 'Send personalized 1:1 emails. More personal than marketing emails.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Send Follow-up' },
            { name: 'subject', type: 'string', required: false, description: 'Email subject', example: 'Re: Your Inquiry' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'telegramNode',
        category: 'actions',
        name: 'Telegram Action',
        description: 'Send messages or media via connected Telegram bot.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Send Alert' },
            { name: 'messageType', type: 'string', required: false, description: 'Message type (text, photo, document)', example: 'text' },
            { name: 'chatId', type: 'string', required: true, description: 'Telegram chat ID', example: '123456789' },
            { name: 'messageText', type: 'string', required: false, description: 'Message text or media URL', example: 'Alert: server down' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'publishNode',
        category: 'actions',
        name: 'Publish to Social Media',
        description: 'Post content to social media platforms (Instagram, LinkedIn, X, etc). Takes text and optional image from incoming nodes.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Publish Post' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'slackNode',
        category: 'actions',
        name: 'Send Slack Message',
        description: 'Post a message (text or Block Kit) to a Slack channel using your connected Slack workspace.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Notify Team' },
            { name: 'channel', type: 'string', required: true, description: 'Channel id (C…) or name (#general)', example: '#general' },
            { name: 'text', type: 'string', required: false, description: 'Message text (supports variables)', example: 'New lead: {{contact.name}}' },
            { name: 'blocks', type: 'string', required: false, description: 'Optional Block Kit JSON (array)', example: '[{"type":"section","text":{"type":"mrkdwn","text":"Hi"}}]' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'gmailNode',
        category: 'actions',
        name: 'Send Gmail',
        description: 'Send an email via a connected Gmail (Google) account.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Send Email' },
            { name: 'to', type: 'string', required: true, description: 'Recipient(s), comma-separated', example: 'lead@example.com' },
            { name: 'subject', type: 'string', required: false, description: 'Subject line', example: 'Thanks for reaching out' },
            { name: 'body', type: 'string', required: false, description: 'Plain-text body (supports variables)', example: 'Hi {{contact.firstName}}' },
        ],
        hasInput: true,
        hasOutput: true,
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // CRM ACTIONS — mutate CRM records from a workflow
    // ─────────────────────────────────────────────────────────────────────────────
    {
        type: 'crmCreateContact',
        category: 'actions',
        name: 'Create Contact',
        description: 'Create a new CRM contact. Scoped to the run\'s organization.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Create Contact' },
            { name: 'firstName', type: 'string', required: false, description: 'First name', example: 'Ada' },
            { name: 'email', type: 'string', required: false, description: 'Email', example: 'ada@example.com' },
            { name: 'phone', type: 'string', required: false, description: 'Phone', example: '+15551234' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'crmUpdateContact',
        category: 'actions',
        name: 'Update Contact',
        description: 'Update fields on an existing contact.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Update Contact' },
            { name: 'contactId', type: 'string', required: false, description: 'Contact id (defaults to triggering contact)', example: '{{trigger.record._id}}' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'crmCreateDeal',
        category: 'actions',
        name: 'Create Deal',
        description: 'Create a new deal in a pipeline stage.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Create Deal' },
            { name: 'name', type: 'string', required: false, description: 'Deal name', example: 'New opportunity' },
            { name: 'pipelineId', type: 'string', required: true, description: 'Pipeline id', example: '...' },
            { name: 'stageId', type: 'string', required: true, description: 'Stage id', example: '...' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'crmUpdateDeal',
        category: 'actions',
        name: 'Update Deal',
        description: 'Update fields on an existing deal.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Update Deal' },
            { name: 'dealId', type: 'string', required: false, description: 'Deal id (defaults to triggering deal)', example: '{{trigger.record._id}}' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'crmMoveStage',
        category: 'actions',
        name: 'Move Deal Stage',
        description: 'Move a deal to a different pipeline stage (records stage history).',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Move Stage' },
            { name: 'dealId', type: 'string', required: false, description: 'Deal id (defaults to triggering deal)', example: '{{trigger.record._id}}' },
            { name: 'stageId', type: 'string', required: true, description: 'Target stage id', example: '...' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'crmAssignOwner',
        category: 'actions',
        name: 'Assign Owner',
        description: 'Assign a record to a user — specific / round_robin / load_balanced.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Assign Owner' },
            { name: 'entityType', type: 'string', required: false, description: 'contact | company | deal', example: 'contact' },
            { name: 'strategy', type: 'string', required: false, description: 'specific | round_robin | load_balanced', example: 'round_robin' },
            { name: 'userId', type: 'string', required: false, description: 'Owner id for specific strategy', example: '...' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'crmAddTag',
        category: 'actions',
        name: 'Add Tag',
        description: 'Tag a CRM record by tagId or tagName (creates the tag if missing).',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Add Tag' },
            { name: 'entityType', type: 'string', required: false, description: 'contact | company | deal', example: 'contact' },
            { name: 'tagName', type: 'string', required: false, description: 'Tag name (or use tagId)', example: 'VIP' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'crmRemoveTag',
        category: 'actions',
        name: 'Remove Tag',
        description: 'Remove a tag from a CRM record by tagId or tagName.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Remove Tag' },
            { name: 'entityType', type: 'string', required: false, description: 'contact | company | deal', example: 'contact' },
            { name: 'tagName', type: 'string', required: false, description: 'Tag name (or use tagId)', example: 'VIP' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'crmCreateActivity',
        category: 'actions',
        name: 'Create Activity',
        description: 'Log an activity (note/call/meeting/email/task) on a record.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Log Activity' },
            { name: 'activityType', type: 'string', required: false, description: 'note | call | meeting | email | task', example: 'note' },
            { name: 'subject', type: 'string', required: false, description: 'Subject', example: 'Followed up' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'crmCreateTask',
        category: 'actions',
        name: 'Create Task',
        description: 'Create a follow-up task on a record (dueInDays + assignTo owner/specific/creator).',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Create Task' },
            { name: 'title', type: 'string', required: false, description: 'Task title', example: 'Call back' },
            { name: 'dueInDays', type: 'number', required: false, description: 'Due in N days', example: 3 },
            { name: 'assignTo', type: 'string', required: false, description: 'owner | specific | creator', example: 'owner' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'crmLogNote',
        category: 'actions',
        name: 'Log Note',
        description: 'Log a note on a CRM record (contact/company/deal).',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Log Note' },
            { name: 'targetType', type: 'string', required: false, description: 'contact | company | deal', example: 'contact' },
            { name: 'targetId', type: 'string', required: false, description: 'Record id (defaults to triggering record)', example: '{{trigger.record._id}}' },
            { name: 'body', type: 'string', required: false, description: 'Note body', example: 'Spoke with customer.' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'crmFindRecord',
        category: 'actions',
        name: 'Find Record',
        description: 'Look up a contact/company/deal by a match field. Outputs { found, record }.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Find Record' },
            { name: 'entityType', type: 'string', required: true, description: 'contact | company | deal', example: 'contact' },
            { name: 'matchField', type: 'string', required: true, description: 'Field to match (email/phone/name/domain)', example: 'email' },
            { name: 'matchValue', type: 'string', required: true, description: 'Value to match (supports {{vars}})', example: '{{trigger.email}}' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'crmFindRecords',
        category: 'actions',
        name: 'Find Records',
        description: 'Find many contacts/companies/deals by a filter set. Outputs { records, count } — feed records into a "Run once per item" node.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Find Records' },
            { name: 'entityType', type: 'string', required: true, description: 'contact | company | deal', example: 'contact' },
            { name: 'filters', type: 'object', required: false, description: 'Array of { field, operator, value } rows (AND-ed)', example: '[{"field":"status","operator":"equals","value":"lead"}]' },
            { name: 'tag', type: 'string', required: false, description: 'Tag id(s) to match (comma-separated)', example: '' },
            { name: 'limit', type: 'number', required: false, description: 'Max records (default 100, cap 500)', example: 100 },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'crmDeleteRecord',
        category: 'actions',
        name: 'Delete Record',
        description: 'Hard-delete a CRM record (defaults to the triggering record when recordId omitted).',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Delete Record' },
            { name: 'entityType', type: 'string', required: true, description: 'contact | company | deal', example: 'contact' },
            { name: 'recordId', type: 'string', required: false, description: 'Record id (defaults to triggering record)', example: '{{trigger.record._id}}' },
        ],
        hasInput: true,
        hasOutput: true,
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // LOGIC — Control flow
    // ─────────────────────────────────────────────────────────────────────────────
    {
        type: 'logicBranch',
        category: 'logic',
        name: 'Branch (If/Else)',
        description: 'Conditional routing. Routes workflow to different paths based on conditions.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Check Condition' },
            { name: 'condition', type: 'string', required: false, description: 'Condition expression', example: 'sentiment === positive' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'logicDelay',
        category: 'logic',
        name: 'Delay',
        description: 'Pause the workflow for a specified duration before continuing.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Wait 5 minutes' },
            { name: 'delayMs', type: 'number', required: false, description: 'Delay in ms', example: 300000 },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'logicLoop',
        category: 'logic',
        name: 'Loop',
        description: 'Iterate over an array of items, executing downstream nodes for each item.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'For Each Item' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'controlFormInput',
        category: 'logic',
        name: 'Form Input (pause for human)',
        description: 'Pause the workflow and ask a user to fill out a form. Execution resumes with the submitted values once they respond.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Collect Approval Details' },
            { name: 'title', type: 'string', required: true, description: 'Form title shown to the assignee', example: 'Approve this deal' },
            { name: 'description', type: 'string', required: false, description: 'Optional instructions', example: 'Confirm the discount before we proceed.' },
            { name: 'assignTo', type: 'string', required: false, description: 'Who to assign: specific | workflow_owner', example: 'workflow_owner' },
            { name: 'assigneeId', type: 'string', required: false, description: 'User id when assignTo=specific', example: '' },
            { name: 'fields', type: 'string', required: false, description: 'JSON array of field defs ({key,label,type,options?,required?,placeholder?})', example: '[{"key":"note","label":"Note","type":"textarea"}]' },
        ],
        hasInput: true,
        hasOutput: true,
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // OUTPUT — Create documents, designs
    // ─────────────────────────────────────────────────────────────────────────────
    {
        type: 'documentNode',
        category: 'output',
        name: 'Document',
        description: 'Rich text document editor. Receives incoming content and allows editing, saving to Docs, or publishing to WordPress.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Blog Post Draft' },
            { name: 'name', type: 'string', required: false, description: 'Document name', example: 'Untitled' },
        ],
        hasInput: true,
        hasOutput: true,
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // UTILITY — Canvas helpers
    // ─────────────────────────────────────────────────────────────────────────────
    {
        type: 'stickyNote',
        category: 'utility',
        name: 'Sticky Note',
        description: 'Add comments and notes to the canvas. Does not participate in workflow execution.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Note content', example: 'TODO: Review this workflow' },
            { name: 'text', type: 'string', required: false, description: 'Note text', example: '' },
        ],
        hasInput: false,
        hasOutput: false,
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // INTEGRATIONS — Third-party integrations
    // ─────────────────────────────────────────────────────────────────────────────
    {
        type: 'googleSearchNode',
        category: 'data_sources',
        name: 'Google Search',
        description: 'Search the web using Brave API or Perplexity AI. Returns search results as structured data.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Search' },
            { name: 'query', type: 'string', required: true, description: 'Search query', example: 'trending AI tools 2024' },
            { name: 'provider', type: 'string', required: false, description: 'Search provider: brave or perplexity', example: 'brave' },
            { name: 'searchType', type: 'string', required: false, description: 'Search type: web, news, images', example: 'web' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'adsInsightsNode',
        category: 'data_sources',
        name: 'Ads Insights',
        description: 'Read campaign or account metrics for connected Google/Meta ad accounts from the unified metrics store. Read-only — never modifies campaigns.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Ads Insights' },
            { name: 'platform', type: 'string', required: false, description: 'all, meta_ads, or google_ads', example: 'all' },
            { name: 'entityType', type: 'string', required: false, description: 'campaign or account', example: 'campaign' },
            { name: 'days', type: 'number', required: false, description: 'Look-back window in days (1-90)', example: '30' },
            { name: 'brandId', type: 'string', required: false, description: 'Optional brand scope override (defaults to the workflow brand)', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'marketingAnalyticsNode',
        category: 'data_sources',
        name: 'Marketing Analytics',
        description: 'Read website traffic (GA4), organic search (Search Console), or account-level social metrics from the unified metrics store. Read-only — never modifies anything.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Marketing Analytics' },
            { name: 'source', type: 'string', required: true, description: 'ga4, search_console, or social', example: 'ga4' },
            { name: 'days', type: 'number', required: false, description: 'Look-back window in days (1-90)', example: '30' },
            { name: 'brandId', type: 'string', required: false, description: 'Optional brand scope override (defaults to the workflow brand)', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'facebookNode',
        category: 'social_media',
        name: 'Facebook',
        description: 'Scrape Facebook post content or publish to a connected Facebook page. Dual-mode: scrape or post.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Facebook Post' },
            { name: 'mode', type: 'string', required: false, description: 'Mode: scrape or post', example: 'scrape' },
            { name: 'url', type: 'string', required: false, description: 'Facebook post URL for scraping', example: '' },
            { name: 'caption', type: 'string', required: false, description: 'Caption for posting', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'googleBusinessNode',
        category: 'social_media',
        name: 'Google Business',
        description: 'Manage Google Business Profile: create posts, read reviews, reply to reviews.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'GBP' },
            { name: 'mode', type: 'string', required: false, description: 'Mode: create_post, read_reviews, reply_review', example: 'create_post' },
            { name: 'postContent', type: 'string', required: false, description: 'Post or reply content', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'notionNode',
        category: 'integrations',
        name: 'Notion',
        description: 'Interact with Notion: search pages, read content, create new pages, or update existing ones.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Notion' },
            { name: 'mode', type: 'string', required: false, description: 'Mode: search, read, create, update', example: 'search' },
            { name: 'query', type: 'string', required: false, description: 'Search query or page ID', example: '' },
            { name: 'content', type: 'string', required: false, description: 'Page content for create/update', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'googleWorkspaceNode',
        category: 'integrations',
        name: 'Google Workspace',
        description: 'Interact with Google Workspace: Sheets (read/write/append), Docs (read/create), Slides (read/create), Forms (read responses).',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Google Sheets' },
            { name: 'service', type: 'string', required: false, description: 'Service: sheets, docs, slides, forms', example: 'sheets' },
            { name: 'action', type: 'string', required: false, description: 'Action: read, write, append, create', example: 'read' },
            { name: 'documentId', type: 'string', required: false, description: 'Document ID or URL', example: '' },
            { name: 'content', type: 'string', required: false, description: 'Content for write/create', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'sheetsNode',
        category: 'integrations',
        name: 'Google Sheets',
        description: 'Append, update, upsert or look up rows in a Google Sheet (first-class Sheets node).',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Google Sheets' },
            { name: 'action', type: 'string', required: false, description: 'append_row, update_row, upsert_row, lookup_rows, read', example: 'append_row' },
            { name: 'spreadsheetId', type: 'string', required: true, description: 'Spreadsheet ID', example: '1AbC...' },
            { name: 'range', type: 'string', required: true, description: 'A1 range (include header for match ops)', example: 'Sheet1!A:D' },
            { name: 'values', type: 'array', required: false, description: 'Row values (2-D for append/update, 1-D for upsert)', example: '[["Ada","ada@x.com"]]' },
            { name: 'matchColumn', type: 'string', required: false, description: 'Header column to match on (upsert/lookup/update)', example: 'Email' },
            { name: 'matchValue', type: 'string', required: false, description: 'Value to match', example: 'ada@x.com' },
        ],
        hasInput: true,
        hasOutput: true,
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // INTEGRATIONS HUB (2026-06 expansion) — accounts connect in Settings → Connections
    // ─────────────────────────────────────────────────────────────────────────────
    {
        type: 'mailchimpNode',
        category: 'integrations',
        name: 'Mailchimp',
        description: 'Read Mailchimp audiences, members and campaign reports (import-only).',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Mailchimp' },
            { name: 'action', type: 'string', required: false, description: 'list_audiences, get_audience, list_members, get_member, search_members, list_campaigns, get_campaign_report', example: 'list_audiences' },
            { name: 'listId', type: 'string', required: false, description: 'Audience/list ID', example: '' },
            { name: 'email', type: 'string', required: false, description: 'Member email for get_member', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'hubspotNode',
        category: 'integrations',
        name: 'HubSpot',
        description: 'Read HubSpot contacts, companies, deals and lists (import-only).',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'HubSpot' },
            { name: 'action', type: 'string', required: false, description: 'list_contacts, get_contact, search_contacts, get_company, search_companies, get_deal, search_deals, get_list_members', example: 'list_contacts' },
            { name: 'objectId', type: 'string', required: false, description: 'Record ID for get_* actions', example: '' },
            { name: 'query', type: 'string', required: false, description: 'Search query for search_* actions', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'airtableNode',
        category: 'integrations',
        name: 'Airtable',
        description: 'Read and write records in Airtable bases.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Airtable' },
            { name: 'action', type: 'string', required: false, description: 'list_bases, list_tables, list_records, get_record, create_record, update_record, delete_record', example: 'list_records' },
            { name: 'baseId', type: 'string', required: false, description: 'Base ID (app…)', example: '' },
            { name: 'table', type: 'string', required: false, description: 'Table name or ID', example: '' },
            { name: 'fields', type: 'object', required: false, description: 'Record fields for create/update', example: '{"Name": "Acme"}' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'zohoNode',
        category: 'integrations',
        name: 'Zoho',
        description: 'Read Zoho CRM records and Zoho Campaigns data (import-only).',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Zoho' },
            { name: 'action', type: 'string', required: false, description: 'get_records, get_record, search_records, list_mailing_lists, list_campaigns', example: 'get_records' },
            { name: 'module', type: 'string', required: false, description: 'CRM module: Leads, Contacts, Deals, Accounts', example: 'Leads' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'webflowNode',
        category: 'integrations',
        name: 'Webflow',
        description: 'Create, update and publish Webflow CMS items.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Webflow' },
            { name: 'action', type: 'string', required: false, description: 'list_sites, list_collections, list_items, get_item, create_item, update_item, publish_items', example: 'list_sites' },
            { name: 'collectionId', type: 'string', required: false, description: 'CMS collection ID', example: '' },
            { name: 'fieldData', type: 'object', required: false, description: 'Item fields for create/update', example: '{"name": "Post", "slug": "post"}' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'bloggerNode',
        category: 'integrations',
        name: 'Blogger',
        description: 'Create and publish posts on Blogger blogs.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Blogger' },
            { name: 'action', type: 'string', required: false, description: 'list_blogs, list_posts, get_post, create_post, update_post, publish_post', example: 'list_blogs' },
            { name: 'blogId', type: 'string', required: false, description: 'Blog ID', example: '' },
            { name: 'title', type: 'string', required: false, description: 'Post title', example: '' },
            { name: 'content', type: 'string', required: false, description: 'Post content (HTML)', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'wordpressNode',
        category: 'integrations',
        name: 'WordPress',
        description: 'Create and update posts on a self-hosted WordPress site.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'WordPress' },
            { name: 'action', type: 'string', required: false, description: 'list_posts, get_post, create_post, update_post, list_categories, list_tags', example: 'list_posts' },
            { name: 'title', type: 'string', required: false, description: 'Post title', example: '' },
            { name: 'content', type: 'string', required: false, description: 'Post content (HTML)', example: '' },
            { name: 'status', type: 'string', required: false, description: 'draft or publish', example: 'draft' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'apolloNode',
        category: 'integrations',
        name: 'Apollo.io',
        description: 'Enrich people/companies and search prospects with Apollo.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Apollo' },
            { name: 'action', type: 'string', required: false, description: 'enrich_person, search_people, enrich_organization', example: 'enrich_person' },
            { name: 'email', type: 'string', required: false, description: 'Person email to enrich', example: '' },
            { name: 'domain', type: 'string', required: false, description: 'Company domain', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'semrushNode',
        category: 'integrations',
        name: 'Semrush',
        description: 'Pull domain, keyword and backlink reports for SEO workflows.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Semrush' },
            { name: 'action', type: 'string', required: false, description: 'domain_overview, keyword_overview, backlinks_summary', example: 'domain_overview' },
            { name: 'domain', type: 'string', required: false, description: 'Domain to analyze', example: 'example.com' },
            { name: 'phrase', type: 'string', required: false, description: 'Keyword phrase', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'revenuecatNode',
        category: 'integrations',
        name: 'RevenueCat',
        description: 'Query RevenueCat customers, subscriptions and entitlements.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'RevenueCat' },
            { name: 'action', type: 'string', required: false, description: 'list_projects, get_customer, get_customer_subscriptions, get_customer_purchases, list_entitlements', example: 'list_projects' },
            { name: 'projectId', type: 'string', required: false, description: 'RevenueCat project ID', example: '' },
            { name: 'customerId', type: 'string', required: false, description: 'Customer app user ID', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'n8nNode',
        category: 'integrations',
        name: 'n8n',
        description: 'Trigger and monitor workflows on a connected n8n instance.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'n8n' },
            { name: 'action', type: 'string', required: false, description: 'list_workflows, get_workflow, activate_workflow, deactivate_workflow, list_executions, get_execution, trigger_webhook', example: 'list_workflows' },
            { name: 'workflowId', type: 'string', required: false, description: 'n8n workflow ID', example: '' },
            { name: 'webhookPath', type: 'string', required: false, description: 'Webhook path for trigger_webhook', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'shopifyNode',
        category: 'integrations',
        name: 'Shopify',
        description: 'Read products, orders and customers from a connected Shopify store.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Shopify' },
            { name: 'action', type: 'string', required: false, description: 'get_shop, list_products, get_product, search_products, list_orders, get_order, list_customers, search_customers', example: 'list_products' },
            { name: 'id', type: 'string', required: false, description: 'Resource ID for get_* actions', example: '' },
            { name: 'query', type: 'string', required: false, description: 'Search query', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'stripeNode',
        category: 'integrations',
        name: 'Stripe',
        description: 'Read-only Stripe lookups: find a customer, list recent payments, check subscription status.',
        dataFields: [
            { name: 'label', type: 'string', required: true, description: 'Node label', example: 'Stripe' },
            { name: 'action', type: 'string', required: false, description: 'get_customer, list_recent_payments, get_subscription_status', example: 'get_customer' },
            { name: 'email', type: 'string', required: false, description: 'Customer email (get_customer / get_subscription_status)', example: '' },
            { name: 'limit', type: 'number', required: false, description: 'Max payments to return (list_recent_payments)', example: 10 },
        ],
        hasInput: true,
        hasOutput: true,
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // PHASE 1 — NEW NODES
    // ─────────────────────────────────────────────────────────────────────────────
    {
        type: 'agenticNode',
        category: 'ai',
        name: 'AI Agent',
        description: 'Goal-driven AI agent that autonomously decides which tools to call. Provide a goal and enable tools — the agent plans and executes multi-step tasks.',
        dataFields: [
            { name: 'goal', type: 'string', required: true, description: 'What the agent should accomplish', example: 'Reply to every DM asking about pricing with our price sheet link' },
            { name: 'personality', type: 'string', required: false, description: 'Agent personality preset: friendly, support, professional, brand, custom', example: 'friendly' },
            { name: 'enabledTools', type: 'object', required: false, description: 'Map of tool keys to booleans: sendDM, readCRM, searchKB, sendEmail, sendWhatsApp, createPost', example: '{"sendDM": true, "readCRM": true}' },
            { name: 'maxSteps', type: 'number', required: false, description: 'Maximum autonomous steps (1-10)', example: 5 },
            { name: 'memoryEnabled', type: 'boolean', required: false, description: 'Whether agent remembers past interactions', example: true },
            { name: 'fallbackAction', type: 'string', required: false, description: 'What to do when agent cannot complete goal', example: 'Transfer to human' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'instagramDMNode',
        category: 'social_media',
        name: 'Instagram DM/Comment',
        description: 'Instagram automation: comment-to-DM funnels, auto-reply to DMs, and story reply automation. Trigger-based with keyword matching.',
        dataFields: [
            { name: 'mode', type: 'string', required: true, description: 'Automation mode: comment_to_dm, auto_reply_dm, story_reply', example: 'comment_to_dm' },
            { name: 'keywords', type: 'string', required: false, description: 'Comma-separated trigger keywords', example: 'info, pricing, link' },
            { name: 'messageTemplate', type: 'string', required: true, description: 'Message template with {{username}} variable support', example: 'Hey {{username}}! Thanks for your interest.' },
            { name: 'delaySeconds', type: 'number', required: false, description: 'Delay before sending (0-60 seconds)', example: 5 },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'chatbotNode',
        category: 'ai',
        name: 'Chatbot Builder',
        description: 'Hybrid rule-based + AI chatbot. Define quick reply buttons for common paths and enable AI fallback for unmatched queries.',
        dataFields: [
            { name: 'platform', type: 'string', required: true, description: 'Target platform: whatsapp, telegram, instagram, web', example: 'whatsapp' },
            { name: 'welcomeMessage', type: 'string', required: false, description: 'Initial greeting message', example: 'Hi! 👋 How can I help you today?' },
            { name: 'quickReplies', type: 'array', required: false, description: 'Array of quick reply button labels', example: '["Pricing", "Support", "Book a Demo"]' },
            { name: 'aiFallback', type: 'boolean', required: false, description: 'Enable AI for unmatched messages', example: true },
            { name: 'systemPrompt', type: 'string', required: false, description: 'System prompt for AI fallback personality', example: 'You are a helpful support assistant for our brand.' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'smartRouterNode',
        category: 'logic',
        name: 'Smart Router',
        description: 'Multi-way routing with natural language conditions. Routes data to different paths based on conditions. Has multiple output handles + an "otherwise" default.',
        dataFields: [
            { name: 'routes', type: 'array', required: true, description: 'Array of {id, condition, label} route definitions', example: '[{"id":"route_1","condition":"Customer is interested in pricing","label":"Pricing"}]' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'httpRequestNode',
        category: 'integrations',
        name: 'HTTP Request',
        description: 'Make HTTP requests to any API. Supports GET/POST/PUT/PATCH/DELETE with headers, auth, and request body.',
        dataFields: [
            { name: 'method', type: 'string', required: true, description: 'HTTP method: GET, POST, PUT, PATCH, DELETE', example: 'GET' },
            { name: 'url', type: 'string', required: true, description: 'Request URL', example: 'https://api.example.com/data' },
            { name: 'headers', type: 'array', required: false, description: 'Array of {key, value} header pairs', example: '[{"key":"Content-Type","value":"application/json"}]' },
            { name: 'body', type: 'string', required: false, description: 'Request body (JSON string)', example: '{"key": "value"}' },
            { name: 'authType', type: 'string', required: false, description: 'Auth type: none, bearer, basic, api_key', example: 'bearer' },
            { name: 'authValue', type: 'string', required: false, description: 'Auth token or credentials', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'audioBotNode',
        category: 'ai',
        name: 'Audio Bot',
        description: 'Voice AI node for text-to-speech, voice cloning, and podcast generation. Converts text input to natural-sounding audio.',
        dataFields: [
            { name: 'mode', type: 'string', required: true, description: 'Mode: tts, voice_clone, podcast', example: 'tts' },
            { name: 'voice', type: 'string', required: false, description: 'Voice preset: alloy, echo, fable, onyx, nova, shimmer', example: 'alloy' },
            { name: 'script', type: 'string', required: true, description: 'Text/script to convert to audio', example: 'Welcome to our weekly marketing podcast!' },
            { name: 'speed', type: 'number', required: false, description: 'Playback speed (0.5-2.0)', example: 1.0 },
        ],
        hasInput: true,
        hasOutput: true,
    },
    // Phase 3 — Structural nodes
    {
        type: 'groupNode',
        category: 'utility',
        name: 'Group',
        description: 'Visual container for organizing nodes. Color-coded, collapsible, with a label and description. Does not affect execution — purely organizational.',
        dataFields: [
            { name: 'label', type: 'string', required: false, description: 'Group name/title', example: 'Lead Processing' },
            { name: 'description', type: 'string', required: false, description: 'Group description', example: 'Handles incoming lead data' },
            { name: 'color', type: 'string', required: false, description: 'Color theme: blue, purple, green, orange, pink', example: 'blue' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'subWorkflowNode',
        category: 'logic',
        name: 'Sub-Workflow',
        description: 'Execute another canvas workflow as a sub-workflow. Passes data between parent and child workflows.',
        dataFields: [
            { name: 'canvasId', type: 'string', required: true, description: 'ID of the canvas to execute as sub-workflow', example: '' },
            { name: 'passInputData', type: 'boolean', required: false, description: 'Whether to pass upstream data to sub-workflow', example: true },
            { name: 'waitForCompletion', type: 'boolean', required: false, description: 'Whether to wait for sub-workflow to complete before continuing', example: true },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        // Agent ↔ workflow ties (2.26) — delegate a task to the autonomous Agent.
        type: 'delegateToAgentNode',
        category: 'logic',
        name: 'Delegate to Agent',
        description: 'Hand a task off to the autonomous Agent. Creates an agent mission (in draft, for your review) carrying the instruction and optional upstream context.',
        dataFields: [
            { name: 'task', type: 'string', required: true, description: 'Instruction handed to the agent (supports variables)', example: 'Follow up with this lead and book a demo.' },
            { name: 'contextData', type: 'string', required: false, description: 'Path/expression to upstream data attached as supporting context', example: '$findRecord.record' },
            { name: 'agentId', type: 'string', required: false, description: 'Optional specialist agent id to assign', example: '' },
        ],
        hasInput: true,
        hasOutput: true,
    },

    // ─────────────────────────────────────────────────────────────────────────────
    // DATA TRANSFORM (H7 / TODO 2.2) — dropdown-driven, pure data ops (no code)
    // ─────────────────────────────────────────────────────────────────────────────
    {
        type: 'editFieldsNode',
        category: 'utility',
        name: 'Edit Fields',
        description: 'Set, rename, or remove fields on an input object (or every object in an array). Build operation rows in Advanced.',
        dataFields: [
            { name: 'source', type: 'string', required: false, description: 'Path/expression to the input object or array', example: '$findRecords.records' },
            { name: 'operations', type: 'object', required: false, description: 'Array of { op: set|rename|remove, field, value?, newName? } rows', example: '[{"op":"set","field":"status","value":"active"}]' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'dedupeNode',
        category: 'utility',
        name: 'Deduplicate',
        description: 'Remove duplicate items from an array. Compare on field(s) or the whole item; keep first or last. Outputs { items, count, removed }.',
        dataFields: [
            { name: 'source', type: 'string', required: false, description: 'Path/expression to the input array', example: '$findRecords.records' },
            { name: 'compareBy', type: 'string', required: false, description: 'Comma-separated compare fields (empty = whole item)', example: 'email' },
            { name: 'keep', type: 'string', required: false, description: 'Which duplicate to keep: first or last', example: 'first' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'mergeNode',
        category: 'utility',
        name: 'Merge',
        description: 'Combine two inputs: append, merge-by-key, or combine fields. Outputs { items, count } (or { item } for combine-fields).',
        dataFields: [
            { name: 'mode', type: 'string', required: false, description: 'append | merge-by-key | combine-fields', example: 'append' },
            { name: 'sourceA', type: 'string', required: false, description: 'Path/expression to input A', example: '$nodeA.records' },
            { name: 'sourceB', type: 'string', required: false, description: 'Path/expression to input B', example: '$nodeB.records' },
            { name: 'key', type: 'string', required: false, description: 'Key field for merge-by-key', example: 'id' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'sortNode',
        category: 'utility',
        name: 'Sort',
        description: 'Sort an array by a field (ascending/descending) with string, number, or date coercion. Outputs { items, count }.',
        dataFields: [
            { name: 'source', type: 'string', required: false, description: 'Path/expression to the input array', example: '$findRecords.records' },
            { name: 'field', type: 'string', required: false, description: 'Field to sort by (empty = the item itself)', example: 'createdAt' },
            { name: 'direction', type: 'string', required: false, description: 'asc or desc', example: 'asc' },
            { name: 'type', type: 'string', required: false, description: 'string | number | date', example: 'string' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'aggregateNode',
        category: 'utility',
        name: 'Aggregate / Group',
        description: 'Group an array by a field (optional) and compute count/sum/avg/min/max/first/last aggregations. Build rows in Advanced.',
        dataFields: [
            { name: 'source', type: 'string', required: false, description: 'Path/expression to the input array', example: '$findRecords.records' },
            { name: 'groupBy', type: 'string', required: false, description: 'Field to group by (empty = single flat result)', example: 'status' },
            { name: 'aggregations', type: 'object', required: false, description: 'Array of { field, op, as } rows', example: '[{"field":"amount","op":"sum","as":"total"}]' },
        ],
        hasInput: true,
        hasOutput: true,
    },
    {
        type: 'dateTimeNode',
        category: 'utility',
        name: 'Date / Time',
        description: 'Date math + formatting: now, add, subtract, format, diff, parse. Outputs { result }.',
        dataFields: [
            { name: 'op', type: 'string', required: false, description: 'now | add | subtract | format | diff | parse', example: 'add' },
            { name: 'input', type: 'string', required: false, description: 'Base date (ISO / epoch / {{ref}})', example: '{{trigger.createdAt}}' },
            { name: 'amount', type: 'number', required: false, description: 'Amount for add/subtract/diff', example: 3 },
            { name: 'unit', type: 'string', required: false, description: 'minutes | hours | days | weeks | months', example: 'days' },
            { name: 'format', type: 'string', required: false, description: 'date-fns format string (for format op)', example: 'yyyy-MM-dd' },
        ],
        hasInput: true,
        hasOutput: true,
    },
];

// =============================================================================
// ENGINE MAPPING — Single source of truth for canvas → engine translation
// =============================================================================

/**
 * Engine mapping: canvas node `type` → `{ category, subType }` used by the
 * UnifiedWorkflowExecutionEngine. `subType` must either be a NodeProcessorRegistry
 * key or an inline handler in the engine. Nodes in `SKIPPED_NODE_TYPES` are
 * stripped from the workflow graph before execution (visual-only).
 */
export const NODE_ENGINE_MAPPING: Record<string, { category: EngineCategory; subType: string }> = {
    // Triggers
    triggerWebhook: { category: 'trigger', subType: 'webhook' },
    triggerSchedule: { category: 'trigger', subType: 'schedule' },
    triggerManual: { category: 'trigger', subType: 'manual' },
    triggerWhatsApp: { category: 'trigger', subType: 'whatsapp_message' },
    triggerEmail: { category: 'trigger', subType: 'email_received' },
    triggerSocial: { category: 'trigger', subType: 'social_event' },
    triggerIntegrationWebhook: { category: 'trigger', subType: 'integration_webhook' },
    triggerAdLead: { category: 'trigger', subType: 'ad_lead_captured' },
    triggerFormSubmission: { category: 'trigger', subType: 'form_submission' },
    triggerPolling: { category: 'trigger', subType: 'polling' },
    triggerAdsWeeklySummary: { category: 'trigger', subType: 'ads_weekly_summary' },
    triggerAdsBudgetThreshold: { category: 'trigger', subType: 'ads_budget_threshold' },
    triggerAdsPerformanceAnomaly: { category: 'trigger', subType: 'ads_performance_anomaly' },
    triggerKeyword: { category: 'trigger', subType: 'keyword_match' },
    triggerTelegram: { category: 'trigger', subType: 'telegram_message' },

    // CRM triggers
    triggerRecordCreated: { category: 'trigger', subType: 'record_created' },
    triggerRecordUpdated: { category: 'trigger', subType: 'record_updated' },
    triggerRecordDeleted: { category: 'trigger', subType: 'record_deleted' },
    triggerFieldChanged: { category: 'trigger', subType: 'field_changed' },
    triggerStageChanged: { category: 'trigger', subType: 'stage_changed' },
    triggerDealWon: { category: 'trigger', subType: 'deal_won' },
    triggerDealLost: { category: 'trigger', subType: 'deal_lost' },
    triggerTagAdded: { category: 'trigger', subType: 'tag_added' },
    triggerTagRemoved: { category: 'trigger', subType: 'tag_removed' },
    triggerTaskCompleted: { category: 'trigger', subType: 'task_completed' },
    triggerManualCrm: { category: 'trigger', subType: 'manual' },

    // Logic / control
    logicBranch: { category: 'logic', subType: 'branch' },
    logicDelay: { category: 'control', subType: 'delay' },
    logicLoop: { category: 'control', subType: 'loop' },
    controlFormInput: { category: 'control', subType: 'form_input' },
    smartRouterNode: { category: 'logic', subType: 'smart_router' },
    subWorkflowNode: { category: 'logic', subType: 'sub_workflow' },
    // Agent ↔ workflow ties (2.26) — runs as an action so the engine routes to
    // the delegate_to_agent processor.
    delegateToAgentNode: { category: 'action', subType: 'delegate_to_agent' },

    // AI
    promptNode: { category: 'ai', subType: 'generate_text' },
    aiChatbot: { category: 'ai', subType: 'chatbot' },
    chatbotNode: { category: 'ai', subType: 'chatbot_builder' },
    audioBotNode: { category: 'ai', subType: 'audio_bot' },
    generateImage: { category: 'ai', subType: 'generate_image' },
    generateVideo: { category: 'ai', subType: 'generate_video' },
    agenticNode: { category: 'ai', subType: 'agentic' },

    // Actions
    actionWhatsApp: { category: 'action', subType: 'send_whatsapp_text' },
    actionWhatsAppButtons: { category: 'action', subType: 'send_whatsapp_buttons' },
    actionWhatsAppList: { category: 'action', subType: 'send_whatsapp_list' },
    actionSms: { category: 'action', subType: 'send_sms' },
    // Voice flow-builder nodes → voice processors.
    voiceMakeCall: { category: 'action', subType: 'make_outbound_call' },
    voiceWaitOutcome: { category: 'action', subType: 'wait_for_call_response' },
    voiceGatherDtmf: { category: 'action', subType: 'gather_dtmf' },
    voiceTransfer: { category: 'action', subType: 'transfer_call' },
    voiceHangup: { category: 'action', subType: 'hangup_call' },
    voiceSendSms: { category: 'action', subType: 'send_sms' },
    actionMarketingEmail: { category: 'action', subType: 'send_marketing_email' },
    actionConversationalEmail: { category: 'action', subType: 'send_conversational_email' },
    publishNode: { category: 'action', subType: 'publish_social' },
    telegramNode: { category: 'action', subType: 'send_telegram' },
    instagramDMNode: { category: 'action', subType: 'instagram_dm' },
    // 2.10 — Slack send + first-class Gmail send.
    slackNode: { category: 'action', subType: 'slack_send' },
    gmailNode: { category: 'action', subType: 'gmail_send' },

    // CRM actions
    crmCreateContact: { category: 'action', subType: 'create_contact' },
    crmUpdateContact: { category: 'action', subType: 'update_contact' },
    crmCreateDeal: { category: 'action', subType: 'create_deal' },
    crmUpdateDeal: { category: 'action', subType: 'update_deal' },
    crmMoveStage: { category: 'action', subType: 'move_stage' },
    crmAssignOwner: { category: 'action', subType: 'assign_owner' },
    crmAddTag: { category: 'action', subType: 'add_tag' },
    crmRemoveTag: { category: 'action', subType: 'remove_tag' },
    crmCreateActivity: { category: 'action', subType: 'create_activity' },
    crmCreateTask: { category: 'action', subType: 'create_task' },
    crmLogNote: { category: 'action', subType: 'log_note' },
    crmFindRecord: { category: 'action', subType: 'find_record' },
    crmFindRecords: { category: 'action', subType: 'find_records' },
    crmDeleteRecord: { category: 'action', subType: 'delete_record' },

    // Data sources
    textInput: { category: 'data', subType: 'text_input' },
    imageNode: { category: 'data', subType: 'image_input' },
    fileNode: { category: 'data', subType: 'file_input' },
    websiteNode: { category: 'data', subType: 'website_scrape' },
    youtubeNode: { category: 'data', subType: 'youtube_transcribe' },
    audioNode: { category: 'data', subType: 'audio_transcribe' },
    instagramNode: { category: 'data', subType: 'instagram_scrape' },
    linkedinNode: { category: 'data', subType: 'linkedin_scrape' },
    xNode: { category: 'data', subType: 'x_scrape' },
    redditNode: { category: 'data', subType: 'reddit_scrape' },
    pinterestNode: { category: 'data', subType: 'pinterest_scrape' },
    facebookNode: { category: 'data', subType: 'facebook' },
    googleBusinessNode: { category: 'data', subType: 'google_business' },
    googleSearchNode: { category: 'data', subType: 'google_search' },
    adsInsightsNode: { category: 'data', subType: 'ads_insights' },
    marketingAnalyticsNode: { category: 'data', subType: 'marketing_analytics' },
    documentNode: { category: 'data', subType: 'document' },

    // Integrations
    httpRequestNode: { category: 'integration', subType: 'http_request' },
    notionNode: { category: 'integration', subType: 'notion' },
    googleWorkspaceNode: { category: 'integration', subType: 'google_workspace' },
    sheetsNode: { category: 'integration', subType: 'sheets_action' },
    // Integrations hub (2026-06 expansion) — engine resolves `integration_${subType}`
    mailchimpNode: { category: 'integration', subType: 'mailchimp' },
    hubspotNode: { category: 'integration', subType: 'hubspot' },
    airtableNode: { category: 'integration', subType: 'airtable' },
    zohoNode: { category: 'integration', subType: 'zoho' },
    webflowNode: { category: 'integration', subType: 'webflow' },
    bloggerNode: { category: 'integration', subType: 'blogger' },
    wordpressNode: { category: 'integration', subType: 'wordpress' },
    apolloNode: { category: 'integration', subType: 'apollo' },
    semrushNode: { category: 'integration', subType: 'semrush' },
    revenuecatNode: { category: 'integration', subType: 'revenuecat' },
    n8nNode: { category: 'integration', subType: 'n8n' },
    shopifyNode: { category: 'integration', subType: 'shopify' },
    // Stripe read-only actions → engine resolves `integration_stripe_action`.
    stripeNode: { category: 'integration', subType: 'stripe_action' },

    // Data transform (H7 / TODO 2.2) — dispatched via the engine `data` branch
    // (`executeDataNode` → registry `data_<subType>` / `<subType>`).
    editFieldsNode: { category: 'data', subType: 'edit_fields' },
    dedupeNode: { category: 'data', subType: 'dedupe' },
    mergeNode: { category: 'data', subType: 'merge' },
    sortNode: { category: 'data', subType: 'sort' },
    aggregateNode: { category: 'data', subType: 'aggregate' },
    dateTimeNode: { category: 'data', subType: 'date_time' },
};

/** Canvas nodes that are stripped from the workflow graph before execution. */
export const SKIPPED_NODE_TYPES: ReadonlySet<string> = new Set(['stickyNote', 'groupNode']);

/** Fallback size for group bounding-box math when the saved node has no measured size. */
const GROUP_DEFAULT_WIDTH = 360;
const GROUP_DEFAULT_HEIGHT = 240;

export interface GroupAssignment {
    /** groupNode id this node belongs to (innermost group wins if nested). */
    groupId: string;
    /** Human-readable label (from group.data.label). */
    groupLabel?: string;
    /** When true, the group — and all its children — are excluded from execution. */
    disabled: boolean;
    /** When true, a failure in any member is caught at the group boundary. */
    errorBoundary: boolean;
    /** Optional color hint for logs / UI badges. */
    color?: string;
}

interface PositionedNode {
    id: string;
    type?: string;
    position?: { x?: number; y?: number };
    width?: number;
    height?: number;
    data?: Record<string, unknown>;
    style?: { width?: number; height?: number };
}

/**
 * Compute which non-group nodes are visually contained inside each group
 * (by bounding-box intersection of the node's center point).
 *
 * Groups with no children are still in the returned `groups` list so the
 * caller can honor `disabled` on empty groups.
 */
export function resolveGroupMembership<T extends PositionedNode>(
    nodes: readonly T[]
): { assignments: Map<string, GroupAssignment>; groups: T[] } {
    const groups = nodes.filter(n => n.type === 'groupNode');
    const assignments = new Map<string, GroupAssignment>();
    if (groups.length === 0) return { assignments, groups };

    type Bounded = { node: T; x1: number; y1: number; x2: number; y2: number; area: number };
    const boxes: Bounded[] = groups.map(g => {
        const x = g.position?.x ?? 0;
        const y = g.position?.y ?? 0;
        const w = g.width ?? g.style?.width ?? GROUP_DEFAULT_WIDTH;
        const h = g.height ?? g.style?.height ?? GROUP_DEFAULT_HEIGHT;
        return { node: g, x1: x, y1: y, x2: x + w, y2: y + h, area: w * h };
    });

    for (const node of nodes) {
        if (!node.type || node.type === 'groupNode' || node.type === 'stickyNote') continue;
        const nx = (node.position?.x ?? 0) + (node.width ?? 0) / 2;
        const ny = (node.position?.y ?? 0) + (node.height ?? 0) / 2;

        // Innermost (smallest-area) matching group wins.
        let chosen: Bounded | null = null;
        for (const b of boxes) {
            if (nx >= b.x1 && nx <= b.x2 && ny >= b.y1 && ny <= b.y2) {
                if (!chosen || b.area < chosen.area) chosen = b;
            }
        }
        if (!chosen) continue;
        const data = chosen.node.data || {};
        assignments.set(node.id, {
            groupId: chosen.node.id,
            groupLabel: typeof data.label === 'string' ? data.label : undefined,
            disabled: !!data.disabled,
            errorBoundary: !!data.errorBoundary,
            color: typeof data.color === 'string' ? data.color : undefined,
        });
    }

    return { assignments, groups };
}

/**
 * Canvas node types the UI supports but that do not map to any engine node.
 * These will fail execution if present — the execute route filters them out
 * with a warning instead of silently coercing.
 */
export function getEngineMapping(nodeType: string): { category: EngineCategory; subType: string } | null {
    return NODE_ENGINE_MAPPING[nodeType] || null;
}

/**
 * Self-audit — runs once at module load in dev. Every NODE_REGISTRY entry
 * should have an engine mapping OR be skipped. Logs a warning for drift.
 */
function auditRegistry(): void {
    if (process.env.NODE_ENV === 'production') return;
    const missing: string[] = [];
    for (const entry of NODE_REGISTRY) {
        if (SKIPPED_NODE_TYPES.has(entry.type)) continue;
        if (!NODE_ENGINE_MAPPING[entry.type]) missing.push(entry.type);
    }
    if (missing.length) {
        console.warn(
            '[node-registry] Palette nodes missing engine mapping:',
            missing.join(', ')
        );
    }
    const registryTypes = new Set(NODE_REGISTRY.map(n => n.type));
    const orphans = Object.keys(NODE_ENGINE_MAPPING).filter(t => !registryTypes.has(t));
    if (orphans.length) {
        console.warn(
            '[node-registry] Engine mappings without a palette entry:',
            orphans.join(', ')
        );
    }
}
auditRegistry();

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Get all valid node type strings */
export function getValidNodeTypes(): string[] {
    return NODE_REGISTRY.map(n => n.type);
}

/** Check if a type string is valid */
export function isValidNodeType(type: string): boolean {
    return NODE_REGISTRY.some(n => n.type === type);
}

/** Get a node entry by type */
export function getNodeByType(type: string): NodeRegistryEntry | undefined {
    return NODE_REGISTRY.find(n => n.type === type);
}

/** Get nodes by category */
export function getNodesByCategory(category: NodeCategory): NodeRegistryEntry[] {
    return NODE_REGISTRY.filter(n => n.category === category);
}

/**
 * Generate the AI prompt section describing all available nodes.
 * Used by the workflow generator API.
 */
export function generateNodeDescriptionForAI(): string {
    const categories: Record<string, NodeRegistryEntry[]> = {};

    for (const node of NODE_REGISTRY) {
        if (!categories[node.category]) {
            categories[node.category] = [];
        }
        categories[node.category].push(node);
    }

    const categoryLabels: Record<string, string> = {
        triggers: 'TRIGGERS (Workflow starting points — every workflow needs at least one)',
        data_sources: 'DATA SOURCES (Input data into the workflow)',
        social_media: 'SOCIAL MEDIA (Extract content from social platforms)',
        ai: 'AI (AI-powered processing and generation)',
        actions: 'ACTIONS (Send messages, emails, publish content)',
        logic: 'LOGIC (Control flow — branching, delays, loops)',
        output: 'OUTPUT (Create documents and designs)',
        utility: 'UTILITY (Canvas helpers — not part of workflow execution)',
        integrations: 'INTEGRATIONS (Third-party apps and services)',
    };

    let prompt = '';

    for (const [category, nodes] of Object.entries(categories)) {
        prompt += `\n### ${categoryLabels[category] || category}\n`;

        for (const node of nodes) {
            const fields = node.dataFields
                .map(f => {
                    const req = f.required ? 'required' : 'optional';
                    const ex = f.example !== undefined ? `, example: ${JSON.stringify(f.example)}` : '';
                    return `    - ${f.name} (${f.type}, ${req}): ${f.description}${ex}`;
                })
                .join('\n');

            prompt += `- type: "${node.type}" — ${node.name}: ${node.description}\n`;
            prompt += `  data fields:\n${fields}\n`;
            prompt += `  handles: ${node.hasInput ? 'input(left)' : 'no input'}, ${node.hasOutput ? 'output(right)' : 'no output'}\n`;
        }
    }

    return prompt;
}
