/**
 * Unified Workflow Node Taxonomy — single source of truth
 *
 * Two orthogonal classifications coexist:
 *
 *  1. `taxonomyCategory` — semantic grouping used by the palette, docs, AI prompt
 *     generation, and cross-bundle coordination. Adds `channel` (whatsapp/email/
 *     voice/social/telegram) and `internal` (system ops like identity resolve)
 *     alongside the existing display categories.
 *
 *  2. `executionCategory` — the dispatch key the unified execution engine reads
 *     from `node.type`. One of seven values: trigger, action, logic, ai, data,
 *     integration, control. Adding new dispatch types would require engine work;
 *     adding taxonomy categories does not.
 *
 *  E.g. `send_whatsapp_text` has taxonomyCategory='channel' (subChannel='whatsapp')
 *  but executionCategory='action' — the engine dispatches it through the action
 *  branch, the palette shows it under "Channels → WhatsApp".
 *
 *  Coverage is documented in temp/audit/workflow-node-matrix.md. Every entry in
 *  that matrix should have a row here, including placeholders reserved for
 *  Bundle 3.
 */

import { NodeType as ExecutionCategory } from '../db/models/unified-workflow.model';

export type TaxonomyCategory =
  | 'trigger'
  | 'crm'
  | 'channel'      // outbound/inbound messaging across channels
  | 'ai'           // studio + agentic + chatbot
  | 'data'         // scrape/fetch/transcribe/passthrough/variables
  | 'logic'        // branch/switch/router/sub-workflow
  | 'integration'  // http/webhook/notion/google-workspace
  | 'control'      // delay/wait/loop/parallel/end
  | 'internal';    // mission-control, identity-resolve, counter

export type ChannelKind = 'whatsapp' | 'email' | 'voice' | 'social' | 'telegram' | 'sms';

export type ReservedFor = 'voice' | 'inbox' | 'social-bridge' | 'identity-resolver';

export interface NodeTaxonomyEntry {
  /** Engine subType — must match NodeProcessorRegistry key or an inline engine handler. */
  subType: string;
  /** UI/docs grouping. */
  taxonomyCategory: TaxonomyCategory;
  /** Engine dispatch key (`node.type` in IWorkflowNode). */
  executionCategory: ExecutionCategory;
  /** When taxonomyCategory === 'channel', the channel this node operates on. */
  channel?: ChannelKind;
  label: string;
  description: string;
  /** Marks rows that other bundles are expected to deliver. The processor may not exist yet. */
  reservedFor?: ReservedFor;
  /** True if the processor is missing from NodeProcessorRegistry (B2-1.5 will close these). */
  processorMissing?: boolean;
}

// ============================================================================
// TRIGGERS
// ============================================================================

const TRIGGERS: NodeTaxonomyEntry[] = [
  { subType: 'manual', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Manual', description: 'Workflow started by a user clicking Run.' },
  { subType: 'scheduled', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Schedule', description: 'Time-based trigger (cron).' },
  { subType: 'webhook', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Webhook', description: 'Incoming HTTP POST.' },
  // CRM record triggers
  { subType: 'record_created', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Record Created', description: 'CRM record (contact/company/deal) created.' },
  { subType: 'record_updated', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Record Updated', description: 'CRM record updated.' },
  { subType: 'field_changed', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Field Changed', description: 'Specific field changed on a CRM record.' },
  { subType: 'stage_changed', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Stage Changed', description: 'Deal moved to a different pipeline stage.' },
  { subType: 'tag_added', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Tag Added', description: 'Tag added to a CRM record.' },
  { subType: 'tag_removed', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Tag Removed', description: 'Tag removed from a CRM record.' },
  { subType: 'record_deleted', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Record Deleted', description: 'CRM record (contact/company/deal) deleted.' },
  { subType: 'deal_won', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Deal Won', description: 'Deal marked as won.' },
  { subType: 'deal_lost', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Deal Lost', description: 'Deal marked as lost.' },
  { subType: 'task_completed', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Task Completed', description: 'CRM task marked complete.' },
  // Channel/inbox triggers
  { subType: 'message_received', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'WhatsApp Message Received', description: 'Inbound WhatsApp message received.' },
  { subType: 'keyword_match', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Keyword Match', description: 'Inbound message matches one of the configured keywords.' },
  { subType: 'email_received', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Email Received', description: 'Inbound email arrives at a connected mailbox.' },
  { subType: 'email_opened', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Email Opened', description: 'Recipient opened a marketing email.' },
  { subType: 'email_clicked', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Email Clicked', description: 'Recipient clicked a link in a marketing email.' },
  { subType: 'social_event', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Social Event', description: 'Mention / comment / DM / new follower / like across IG/LI/X/FB.' },
  { subType: 'telegram_message', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Telegram Message', description: 'Inbound Telegram message to your bot.' },
  { subType: 'integration_webhook', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Integration Event', description: 'Inbound webhook from a connected app (Shopify, RevenueCat).' },
  { subType: 'ad_lead_captured', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Ad Lead Captured', description: 'Lead captured from Meta Lead Ads / Google lead forms (filter by platform, form, or campaign).' },
  { subType: 'keyword_monitor', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Keyword Monitor', description: 'Brand / topic mention detected on web / social / news.' },
  { subType: 'form_submission', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Form Submission', description: 'A hosted/public form was submitted (filter by a specific form, or all forms).' },
  // Ads performance signals — fired by the source-metrics worker
  { subType: 'ads_weekly_summary', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Ads Weekly Summary', description: 'Weekly computed spend/clicks/conversions roll-up across connected ad accounts.' },
  { subType: 'ads_budget_threshold', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Ads Budget Threshold', description: 'Spend pacing crossed a threshold (large week-over-week swing).' },
  { subType: 'ads_performance_anomaly', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Ads Performance Anomaly', description: 'Computed week-over-week spend swing breached the anomaly band.' },
  // Reserved for Bundle 3 voice
  { subType: 'call_completed', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Call Completed', description: 'Voice call ended — carries summary, transcript, disposition.', reservedFor: 'voice' },
  { subType: 'call_inbound', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'Inbound Call', description: 'Inbound call landed on a managed phone number.', reservedFor: 'voice' },
  // AI bot triggers — B3-4.5.8
  { subType: 'ai_bot.conversation_ended', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'AI Bot Conversation Ended', description: 'AI bot handed back / closed the conversation.', reservedFor: 'inbox' },
  { subType: 'ai_bot.escalation_requested', taxonomyCategory: 'trigger', executionCategory: 'trigger', label: 'AI Bot Escalation', description: 'AI bot asked for a human / specialist handover.', reservedFor: 'inbox' },
];

// ============================================================================
// CHANNEL — outbound messaging across surfaces
// ============================================================================

const CHANNEL: NodeTaxonomyEntry[] = [
  // WhatsApp
  { subType: 'send_whatsapp_text', taxonomyCategory: 'channel', executionCategory: 'action', channel: 'whatsapp', label: 'Send WhatsApp Text', description: 'Send a plain text WhatsApp message.' },
  { subType: 'send_whatsapp_image', taxonomyCategory: 'channel', executionCategory: 'action', channel: 'whatsapp', label: 'Send WhatsApp Image', description: 'Send an image with optional caption.' },
  { subType: 'send_whatsapp_video', taxonomyCategory: 'channel', executionCategory: 'action', channel: 'whatsapp', label: 'Send WhatsApp Video', description: 'Send a video with optional caption.' },
  { subType: 'send_whatsapp_pdf', taxonomyCategory: 'channel', executionCategory: 'action', channel: 'whatsapp', label: 'Send WhatsApp PDF', description: 'Send a PDF document.' },
  { subType: 'send_whatsapp_template', taxonomyCategory: 'channel', executionCategory: 'action', channel: 'whatsapp', label: 'Send WhatsApp Template', description: 'Send a pre-approved WhatsApp template message.' },
  { subType: 'send_whatsapp_buttons', taxonomyCategory: 'channel', executionCategory: 'action', channel: 'whatsapp', label: 'Send WhatsApp Buttons', description: 'Send an interactive reply-button message (session, up to 3 buttons).' },
  { subType: 'send_whatsapp_list', taxonomyCategory: 'channel', executionCategory: 'action', channel: 'whatsapp', label: 'Send WhatsApp List', description: 'Send an interactive list menu (session, sections + rows).' },
  // Email
  { subType: 'send_marketing_email', taxonomyCategory: 'channel', executionCategory: 'action', channel: 'email', label: 'Send Marketing Email', description: 'Send a bulk marketing email via the marketing engine.' },
  { subType: 'send_conversational_email', taxonomyCategory: 'channel', executionCategory: 'action', channel: 'email', label: 'Send Conversational Email', description: 'Send a personalized 1:1 email.' },
  // Social
  { subType: 'publish_social', taxonomyCategory: 'channel', executionCategory: 'action', channel: 'social', label: 'Publish Social Post', description: 'Post to one or more connected social accounts.' },
  { subType: 'instagram_dm', taxonomyCategory: 'channel', executionCategory: 'action', channel: 'social', label: 'Instagram DM', description: 'Comment-to-DM, auto-reply DM, story-reply automation.' },
  // Telegram
  { subType: 'send_telegram', taxonomyCategory: 'channel', executionCategory: 'action', channel: 'telegram', label: 'Send Telegram', description: 'Send a message or media via a connected Telegram bot.' },
  // Voice — reserved
  { subType: 'make_outbound_call', taxonomyCategory: 'channel', executionCategory: 'action', channel: 'voice', label: 'Make Outbound Call', description: 'Dial an outbound voice call (optionally with an AI agent).', reservedFor: 'voice' },
  { subType: 'wait_for_call_response', taxonomyCategory: 'channel', executionCategory: 'control', channel: 'voice', label: 'Wait for Call Response', description: 'Pause workflow until inbound call from contact, or timeout.', reservedFor: 'voice' },
  // SMS — rides on the same Twilio (voice) credential + numbers (H16).
  { subType: 'send_sms', taxonomyCategory: 'channel', executionCategory: 'action', channel: 'sms', label: 'Send SMS', description: 'Send a text message via your Twilio voice number (WhatsApp-window fallback).' },
  // Slack — posts to a channel using the org's connected Slack bot token (2.10 / H17).
  { subType: 'slack_send', taxonomyCategory: 'channel', executionCategory: 'action', channel: 'social', label: 'Send Slack Message', description: 'Post a message (text or Block Kit) to a Slack channel.' },
  // Gmail — first-class send, promoted out of the google_workspace dispatcher (2.10).
  { subType: 'gmail_send', taxonomyCategory: 'channel', executionCategory: 'action', channel: 'email', label: 'Send Gmail', description: 'Send an email via a connected Gmail (Google) account.' },
  // Channel-aware router — reserved for Bundle 3 to flesh out alongside identity resolver
  { subType: 'send_channel_message', taxonomyCategory: 'channel', executionCategory: 'action', label: 'Send Channel Message', description: 'Pick the best channel (whatsapp / email / sms / voice) based on contact preference.', reservedFor: 'social-bridge' },
  { subType: 'wait_for_channel_response', taxonomyCategory: 'channel', executionCategory: 'control', label: 'Wait for Channel Response', description: 'Pause workflow until a reply on any channel, or timeout.', reservedFor: 'social-bridge' },
  // Inbox assignment — surface owned by Bundle 3 (inbox)
  { subType: 'assign_to_agent', taxonomyCategory: 'channel', executionCategory: 'action', label: 'Assign to Agent', description: 'Route an inbox conversation to a specific human agent.', reservedFor: 'inbox' },
  { subType: 'assign_to_group', taxonomyCategory: 'channel', executionCategory: 'action', label: 'Assign to Group', description: 'Route an inbox conversation to an agent group.', reservedFor: 'inbox' },
];

// ============================================================================
// CRM — contact / company / deal / activity / tag operations
// ============================================================================

const CRM: NodeTaxonomyEntry[] = [
  { subType: 'create_contact', taxonomyCategory: 'crm', executionCategory: 'action', label: 'Create Contact', description: 'Create a new CRM contact.' },
  { subType: 'update_contact', taxonomyCategory: 'crm', executionCategory: 'action', label: 'Update Contact', description: 'Update fields on an existing contact.' },
  { subType: 'create_deal', taxonomyCategory: 'crm', executionCategory: 'action', label: 'Create Deal', description: 'Create a new deal in a pipeline.' },
  { subType: 'update_deal', taxonomyCategory: 'crm', executionCategory: 'action', label: 'Update Deal', description: 'Update fields on an existing deal.' },
  { subType: 'move_stage', taxonomyCategory: 'crm', executionCategory: 'action', label: 'Move Deal Stage', description: 'Move a deal to a different pipeline stage.' },
  { subType: 'add_tag', taxonomyCategory: 'crm', executionCategory: 'action', label: 'Add Tag', description: 'Tag a CRM record.' },
  { subType: 'remove_tag', taxonomyCategory: 'crm', executionCategory: 'action', label: 'Remove Tag', description: 'Remove a tag from a CRM record.' },
  { subType: 'assign_owner', taxonomyCategory: 'crm', executionCategory: 'action', label: 'Assign Owner', description: 'Assign a record to a user (specific / round-robin / load-balanced).' },
  { subType: 'create_activity', taxonomyCategory: 'crm', executionCategory: 'action', label: 'Create Activity', description: 'Log an activity (note/task/call/meeting/email/message) on a record.' },
  { subType: 'create_task', taxonomyCategory: 'crm', executionCategory: 'action', label: 'Create Task', description: 'Create a follow-up task on a record (type=task; supports dueInDays + assignTo owner/specific/creator).' },
  { subType: 'log_note', taxonomyCategory: 'crm', executionCategory: 'action', label: 'Log Note', description: 'Log a note on a CRM record (contact/company/deal).' },
  { subType: 'find_record', taxonomyCategory: 'crm', executionCategory: 'action', label: 'Find Record', description: 'Look up a contact/company/deal by a match field; outputs { found, record }.' },
  { subType: 'find_records', taxonomyCategory: 'crm', executionCategory: 'action', label: 'Find Records', description: 'Find many contacts/companies/deals by a filter set; outputs { records, count } for per-item fan-out.' },
  { subType: 'delete_record', taxonomyCategory: 'crm', executionCategory: 'action', label: 'Delete Record', description: 'Hard-delete a CRM record (defaults to the triggering record when recordId omitted).' },
];

// ============================================================================
// AI — studio + agentic + chatbot
// ============================================================================

const AI: NodeTaxonomyEntry[] = [
  { subType: 'generate_text', taxonomyCategory: 'ai', executionCategory: 'ai', label: 'Generate Text', description: 'Generate text with an AI model.' },
  { subType: 'generate_image', taxonomyCategory: 'ai', executionCategory: 'ai', label: 'Generate Image', description: 'Generate an image with an AI model.' },
  { subType: 'generate_video', taxonomyCategory: 'ai', executionCategory: 'ai', label: 'Generate Video', description: 'Generate a video clip with an AI model.' },
  { subType: 'agentic', taxonomyCategory: 'ai', executionCategory: 'ai', label: 'AI Agent', description: 'Goal-driven agent that picks tools and executes multi-step plans.' },
  { subType: 'chatbot', taxonomyCategory: 'ai', executionCategory: 'ai', label: 'AI Chat', description: 'Multi-turn AI conversation with context.' },
  { subType: 'chatbot_builder', taxonomyCategory: 'ai', executionCategory: 'ai', label: 'Chatbot Builder', description: 'Hybrid rule-based + AI chatbot with quick replies and AI fallback.' },
  { subType: 'audio_bot', taxonomyCategory: 'ai', executionCategory: 'ai', label: 'Audio Bot', description: 'Voice synthesis: TTS / voice clone / podcast generation.' },
  { subType: 'analyze_sentiment', taxonomyCategory: 'ai', executionCategory: 'ai', label: 'Analyze Sentiment', description: 'Classify sentiment of incoming text.' },
  { subType: 'extract_entities', taxonomyCategory: 'ai', executionCategory: 'ai', label: 'Extract Entities', description: 'NER over incoming text.' },
  { subType: 'classify_intent', taxonomyCategory: 'ai', executionCategory: 'ai', label: 'Classify Intent', description: 'Map incoming message to an intent label.' },
];

// ============================================================================
// DATA — scrape / transcribe / passthrough / variables / kb
// ============================================================================

const DATA: NodeTaxonomyEntry[] = [
  { subType: 'text_input', taxonomyCategory: 'data', executionCategory: 'data', label: 'Text Input', description: 'Static text content passed downstream.' },
  { subType: 'image_input', taxonomyCategory: 'data', executionCategory: 'data', label: 'Image Input', description: 'Static image reference passed downstream.' },
  { subType: 'file_input', taxonomyCategory: 'data', executionCategory: 'data', label: 'File Input', description: 'Static file reference passed downstream.' },
  { subType: 'website_scrape', taxonomyCategory: 'data', executionCategory: 'data', label: 'Website Scrape', description: 'Extract text content from a website URL.' },
  { subType: 'youtube_transcribe', taxonomyCategory: 'data', executionCategory: 'data', label: 'YouTube Transcribe', description: 'Pull transcript and metadata from a YouTube URL.' },
  { subType: 'audio_transcribe', taxonomyCategory: 'data', executionCategory: 'data', label: 'Audio Transcribe', description: 'Transcribe an audio file to text.' },
  { subType: 'reddit_scrape', taxonomyCategory: 'data', executionCategory: 'data', label: 'Reddit Scrape', description: 'Fetch Reddit post + comment thread.' },
  // 2.28: these are official-API fetchers (Meta Graph / LinkedIn REST / X API v2),
  // NOT page scrapers — labelled "Fetch via API" to set the right expectation.
  // (subTypes keep the *_scrape suffix for backward compatibility.)
  { subType: 'instagram_scrape', taxonomyCategory: 'data', executionCategory: 'data', label: 'Instagram (Fetch via API)', description: 'Fetch Instagram post media + captions via the Meta Graph API.' },
  { subType: 'linkedin_scrape', taxonomyCategory: 'data', executionCategory: 'data', label: 'LinkedIn (Fetch via API)', description: 'Fetch LinkedIn post content + engagement via the LinkedIn REST API.' },
  { subType: 'x_scrape', taxonomyCategory: 'data', executionCategory: 'data', label: 'X / Twitter (Fetch via API)', description: 'Fetch X post content + media via the X API v2.' },
  { subType: 'pinterest_scrape', taxonomyCategory: 'data', executionCategory: 'data', label: 'Pinterest Scrape', description: 'Fetch Pinterest pin content.' },
  { subType: 'facebook', taxonomyCategory: 'data', executionCategory: 'data', label: 'Facebook', description: 'Scrape Facebook post content (dual-mode supports posting).' },
  { subType: 'google_business', taxonomyCategory: 'data', executionCategory: 'data', label: 'Google Business', description: 'Read reviews / create posts on Google Business Profile.' },
  { subType: 'google_search', taxonomyCategory: 'data', executionCategory: 'data', label: 'Google Search', description: 'Search the web (Brave / Perplexity).' },
  { subType: 'ads_insights', taxonomyCategory: 'data', executionCategory: 'data', label: 'Ads Insights', description: 'Read campaign metrics from connected ad accounts (read-only).' },
  { subType: 'marketing_analytics', taxonomyCategory: 'data', executionCategory: 'data', label: 'Marketing Analytics', description: 'Read GA4 traffic / Search Console / social account metrics (read-only).' },
  { subType: 'document', taxonomyCategory: 'data', executionCategory: 'data', label: 'Document', description: 'Rich text document — receives upstream content, edits, saves to Docs / publishes to WordPress.' },
  { subType: 'set_variable', taxonomyCategory: 'data', executionCategory: 'data', label: 'Set Variable', description: 'Set or update a workflow variable.' },
  { subType: 'transform', taxonomyCategory: 'data', executionCategory: 'data', label: 'Transform', description: 'Map / filter / project a data shape.' },
  // Data-transform node set (H7 / TODO 2.2) — dropdown-driven, pure reshapers.
  { subType: 'edit_fields', taxonomyCategory: 'data', executionCategory: 'data', label: 'Edit Fields', description: 'Set / rename / remove fields on an object or array of objects.' },
  { subType: 'dedupe', taxonomyCategory: 'data', executionCategory: 'data', label: 'Deduplicate', description: 'Remove duplicate items from an array by compare field(s); keep first or last.' },
  { subType: 'merge', taxonomyCategory: 'data', executionCategory: 'data', label: 'Merge', description: 'Combine two inputs: append, merge-by-key, or combine fields.' },
  { subType: 'sort', taxonomyCategory: 'data', executionCategory: 'data', label: 'Sort', description: 'Sort an array by a field (asc/desc) with string/number/date coercion.' },
  { subType: 'aggregate', taxonomyCategory: 'data', executionCategory: 'data', label: 'Aggregate / Group', description: 'Group-by + count/sum/avg/min/max/first/last aggregations.' },
  { subType: 'date_time', taxonomyCategory: 'data', executionCategory: 'data', label: 'Date / Time', description: 'Date math + formatting: now / add / subtract / format / diff / parse.' },
];

// ============================================================================
// LOGIC — branch / switch / router / sub-workflow
// ============================================================================

const LOGIC: NodeTaxonomyEntry[] = [
  { subType: 'branch', taxonomyCategory: 'logic', executionCategory: 'logic', label: 'Branch (If/Else)', description: 'Conditional routing between two paths.' },
  { subType: 'switch', taxonomyCategory: 'logic', executionCategory: 'logic', label: 'Switch', description: 'Route to one of many paths based on a value.' },
  { subType: 'filter', taxonomyCategory: 'logic', executionCategory: 'logic', label: 'Filter', description: 'Pass-through if condition is true; halt otherwise.' },
  { subType: 'router', taxonomyCategory: 'logic', executionCategory: 'logic', label: 'Router', description: 'Static multi-output router.' },
  { subType: 'smart_router', taxonomyCategory: 'logic', executionCategory: 'logic', label: 'Smart Router', description: 'Multi-output router with natural-language conditions + default fallback.' },
  { subType: 'sub_workflow', taxonomyCategory: 'logic', executionCategory: 'logic', label: 'Sub-Workflow', description: 'Execute another canvas as a sub-workflow.' },
  // Agent ↔ workflow ties (2.26) — hand a task off to the autonomous Agent module.
  { subType: 'delegate_to_agent', taxonomyCategory: 'ai', executionCategory: 'action', label: 'Delegate to Agent', description: 'Hand a task to the autonomous Agent (creates a mission for review).' },
];

// ============================================================================
// INTEGRATION — http / webhook / third-party APIs
// ============================================================================

const INTEGRATION: NodeTaxonomyEntry[] = [
  { subType: 'http_request', taxonomyCategory: 'integration', executionCategory: 'integration', label: 'HTTP Request', description: 'Make an HTTP request to any API (GET/POST/PUT/PATCH/DELETE).' },
  { subType: 'send_webhook', taxonomyCategory: 'integration', executionCategory: 'integration', label: 'Send Webhook', description: 'Fire an outbound webhook with HMAC signing.' },
  { subType: 'notion', taxonomyCategory: 'integration', executionCategory: 'integration', label: 'Notion', description: 'Search / read / create / update Notion pages.' },
  { subType: 'google_workspace', taxonomyCategory: 'integration', executionCategory: 'integration', label: 'Google Workspace', description: 'Sheets / Docs / Slides / Forms operations.' },
  // First-class Google Sheets (2.10) — append / update / upsert / lookup rows.
  { subType: 'sheets_action', taxonomyCategory: 'integration', executionCategory: 'integration', label: 'Google Sheets', description: 'Append, update, upsert or look up rows in a Google Sheet.' },
  // Integrations hub (2026-06 expansion) — engine resolves `integration_${subType}`.
  { subType: 'mailchimp', taxonomyCategory: 'integration', executionCategory: 'integration', label: 'Mailchimp', description: 'Read audiences, members and campaign reports (import-only).' },
  { subType: 'hubspot', taxonomyCategory: 'integration', executionCategory: 'integration', label: 'HubSpot', description: 'Read contacts, companies, deals and lists (import-only).' },
  { subType: 'airtable', taxonomyCategory: 'integration', executionCategory: 'integration', label: 'Airtable', description: 'Read and write records in Airtable bases.' },
  { subType: 'zoho', taxonomyCategory: 'integration', executionCategory: 'integration', label: 'Zoho', description: 'Read Zoho CRM records and Campaigns data (import-only).' },
  { subType: 'webflow', taxonomyCategory: 'integration', executionCategory: 'integration', label: 'Webflow', description: 'Create, update and publish Webflow CMS items.' },
  { subType: 'blogger', taxonomyCategory: 'integration', executionCategory: 'integration', label: 'Blogger', description: 'Create and publish posts on Blogger blogs.' },
  { subType: 'wordpress', taxonomyCategory: 'integration', executionCategory: 'integration', label: 'WordPress', description: 'Create and update posts on a self-hosted WordPress site.' },
  { subType: 'apollo', taxonomyCategory: 'integration', executionCategory: 'integration', label: 'Apollo.io', description: 'Enrich people/companies and search prospects.' },
  { subType: 'semrush', taxonomyCategory: 'integration', executionCategory: 'integration', label: 'Semrush', description: 'Domain, keyword and backlink reports.' },
  { subType: 'revenuecat', taxonomyCategory: 'integration', executionCategory: 'integration', label: 'RevenueCat', description: 'Query customers, subscriptions and entitlements.' },
  { subType: 'n8n', taxonomyCategory: 'integration', executionCategory: 'integration', label: 'n8n', description: 'Trigger and monitor workflows on your n8n instance.' },
  { subType: 'shopify', taxonomyCategory: 'integration', executionCategory: 'integration', label: 'Shopify', description: 'Read products, orders and customers from your store.' },
];

// ============================================================================
// CONTROL — delay / wait / loop / end
// ============================================================================

const CONTROL: NodeTaxonomyEntry[] = [
  { subType: 'delay', taxonomyCategory: 'control', executionCategory: 'control', label: 'Delay', description: 'Pause execution for a specified duration.' },
  { subType: 'wait_for', taxonomyCategory: 'control', executionCategory: 'control', label: 'Wait For', description: 'Pause until a condition becomes true, or timeout.' },
  { subType: 'loop', taxonomyCategory: 'control', executionCategory: 'control', label: 'Loop', description: 'Iterate over an array.' },
  { subType: 'parallel', taxonomyCategory: 'control', executionCategory: 'control', label: 'Parallel', description: 'Fan out into parallel branches.' },
  { subType: 'end', taxonomyCategory: 'control', executionCategory: 'control', label: 'End', description: 'Terminate execution.' },
  { subType: 'form_input', taxonomyCategory: 'control', executionCategory: 'control', label: 'Form Input (pause for human)', description: 'Pause execution, ask a user to fill a form, then resume with their answers.' },
];

// ============================================================================
// INTERNAL — system-level operations with no end-user palette entry
// ============================================================================

const INTERNAL: NodeTaxonomyEntry[] = [
  { subType: 'counter', taxonomyCategory: 'internal', executionCategory: 'data', label: 'Counter', description: 'Increment / decrement a numeric variable (migrated from whatsapp-workflow).', processorMissing: true },
  { subType: 'identity_resolve', taxonomyCategory: 'internal', executionCategory: 'data', label: 'Resolve Identity', description: 'Phone / email / handle → CRM contact. Owned by Bundle 3 (X2).', reservedFor: 'identity-resolver' },
];

// ============================================================================
// REGISTRY
// ============================================================================

export const NODE_TAXONOMY: readonly NodeTaxonomyEntry[] = Object.freeze([
  ...TRIGGERS,
  ...CHANNEL,
  ...CRM,
  ...AI,
  ...DATA,
  ...LOGIC,
  ...INTEGRATION,
  ...CONTROL,
  ...INTERNAL,
]);

const BY_SUBTYPE: Map<string, NodeTaxonomyEntry> = new Map(
  NODE_TAXONOMY.map(entry => [entry.subType, entry])
);

if (BY_SUBTYPE.size !== NODE_TAXONOMY.length) {
  const seen = new Set<string>();
  const dupes = NODE_TAXONOMY.filter(e => {
    if (seen.has(e.subType)) return true;
    seen.add(e.subType);
    return false;
  });
  throw new Error(
    `[node-taxonomy] duplicate subType keys: ${dupes.map(d => d.subType).join(', ')}`
  );
}

/** Look up a taxonomy entry by subType. */
export function getTaxonomyEntry(subType: string): NodeTaxonomyEntry | undefined {
  return BY_SUBTYPE.get(subType);
}

/** All entries in a taxonomy category. */
export function getEntriesByCategory(category: TaxonomyCategory): NodeTaxonomyEntry[] {
  return NODE_TAXONOMY.filter(e => e.taxonomyCategory === category);
}

/** All entries for a specific channel kind. */
export function getEntriesByChannel(channel: ChannelKind): NodeTaxonomyEntry[] {
  return NODE_TAXONOMY.filter(e => e.channel === channel);
}

/** All entries reserved for a not-yet-shipped bundle. */
export function getReservedEntries(reservedFor?: ReservedFor): NodeTaxonomyEntry[] {
  return NODE_TAXONOMY.filter(e => (reservedFor ? e.reservedFor === reservedFor : Boolean(e.reservedFor)));
}

/** All entries whose processor is missing (B2-1.5 closes these). */
export function getMissingProcessorEntries(): NodeTaxonomyEntry[] {
  return NODE_TAXONOMY.filter(e => e.processorMissing && !e.reservedFor);
}

/** Map a subType to its execution category (the engine dispatch key). */
export function getExecutionCategory(subType: string): ExecutionCategory | undefined {
  return BY_SUBTYPE.get(subType)?.executionCategory;
}

/** Sanity check — confirm every taxonomyCategory has at least one entry. */
export function getCategoryCoverage(): Record<TaxonomyCategory, number> {
  const counts: Record<TaxonomyCategory, number> = {
    trigger: 0,
    crm: 0,
    channel: 0,
    ai: 0,
    data: 0,
    logic: 0,
    integration: 0,
    control: 0,
    internal: 0,
  };
  for (const entry of NODE_TAXONOMY) counts[entry.taxonomyCategory]++;
  return counts;
}
