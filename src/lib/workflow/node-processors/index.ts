/**
 * Node Processors Registry
 *
 * Central registry for all node processors.
 * Each processor handles execution of a specific node type.
 */

import { IWorkflowNode, IUnifiedWorkflow } from '../../db/models/unified-workflow.model';
import { IUnifiedWorkflowExecution } from '../../db/models/unified-workflow-execution.model';
import { VariableResolver } from '../variable-resolver';
import { SendWhatsAppTextProcessor } from './whatsapp/send-text';
import { SendWhatsAppImageProcessor } from './whatsapp/send-image';
import { SendWhatsAppTemplateProcessor } from './whatsapp/send-template';
import { SendWhatsAppVideoProcessor } from './whatsapp/send-video';
import { SendWhatsAppPdfProcessor } from './whatsapp/send-pdf';
import { SendWhatsAppButtonsProcessor, SendWhatsAppListProcessor } from './whatsapp/send-interactive';
import { CreateContactProcessor } from './crm/create-contact';
import { UpdateContactProcessor } from './crm/update-contact';
import { CreateDealProcessor } from './crm/create-deal';
import { UpdateDealProcessor } from './crm/update-deal';
import { AddTagProcessor } from './crm/add-tag';
import { RemoveTagProcessor } from './crm/remove-tag';
import { AssignOwnerProcessor } from './crm/assign-owner';
import { MoveStageProcessor } from './crm/move-stage';
import { CreateActivityProcessor } from './crm/create-activity';
import { FindRecordProcessor } from './crm/find-record';
import { FindRecordsProcessor } from './crm/find-records';
import { DeleteRecordProcessor } from './crm/delete-record';
import { SendMarketingEmailProcessor } from './marketing-email/send-email';
import { GenerateTextProcessor } from './ai/generate-text';
import { GenerateImageProcessor } from './ai/generate-image';
import { AgenticProcessor } from './ai/agentic';
import { ChatbotProcessor } from './ai/chatbot';
import { WebsiteScrapeProcessor } from './data/website-scrape';
import { YoutubeTranscribeProcessor } from './data/youtube-transcribe';
import { AudioTranscribeProcessor } from './data/audio-transcribe';
import { RedditScrapeProcessor } from './data/reddit-scrape';
import { InstagramScrapeProcessor } from './data/instagram-scrape';
import { LinkedInScrapeProcessor } from './data/linkedin-scrape';
import { XScrapeProcessor } from './data/x-scrape';
import { PinterestScrapeProcessor } from './data/pinterest-scrape';
import { FacebookScrapeProcessor } from './data/facebook-scrape';
import { GoogleBusinessScrapeProcessor } from './data/google-business-scrape';
import { GoogleSearchProcessor } from './data/google-search';
import { AdsInsightsProcessor } from './data/ads-insights';
import { MarketingAnalyticsProcessor } from './data/marketing-analytics';
import { DocumentProcessor } from './data/document';
// Data-transform node set (H7 / TODO 2.2) — pure, dropdown-driven reshapers.
import { EditFieldsProcessor } from './data/edit-fields';
import { DedupeProcessor } from './data/dedupe';
import { MergeProcessor } from './data/merge';
import { SortProcessor } from './data/sort';
import { AggregateProcessor } from './data/aggregate';
import { DateTimeProcessor } from './data/date-time';
import { SendTelegramProcessor } from './actions/send-telegram';
import { SendConversationalEmailProcessor } from './actions/send-conversational-email';
import { InstagramDMProcessor } from './actions/instagram-dm';
import { ChatbotBuilderProcessor } from './ai/chatbot-builder';
import { AudioBotProcessor } from './ai/audio-bot';
import { GenerateVideoProcessor } from './ai/generate-video';
import { HttpRequestProcessor } from './integration/http-request';
import { SendWebhookProcessor } from './integration/webhook';
import { NotionProcessor } from './integration/notion';
import { GoogleWorkspaceProcessor } from './integration/google-workspace';
import { MailchimpProcessor } from './integration/mailchimp';
import { HubspotProcessor } from './integration/hubspot';
import { AirtableProcessor } from './integration/airtable';
import { ZohoProcessor } from './integration/zoho';
import { WebflowProcessor } from './integration/webflow';
import { BloggerProcessor } from './integration/blogger';
import { WordpressProcessor } from './integration/wordpress';
import { ApolloProcessor } from './integration/apollo';
import { SemrushProcessor } from './integration/semrush';
import { RevenuecatProcessor } from './integration/revenuecat';
import { N8nProcessor } from './integration/n8n';
import { ShopifyProcessor } from './integration/shopify';
import { StripeProcessor } from './integration/stripe';
import { SocialPublishProcessor } from './social/publish-post';
import { SmartRouterProcessor } from './logic/smart-router';
import { SubWorkflowProcessor } from './logic/sub-workflow';
import { DataPassthroughProcessor } from './data/passthrough';
import { NotImplementedProcessor } from './stub/not-implemented';
import { MakeOutboundCallProcessor } from './voice/make-call';
import { SendSmsProcessor } from './messaging/send-sms';
import { WaitForCallResponseProcessor } from './voice/wait-for-call-response';
import { GatherDtmfProcessor } from './voice/gather-dtmf';
import { TransferCallProcessor } from './voice/transfer-call';
import { HangupCallProcessor } from './voice/hangup-call';
import { WaitForChannelResponseProcessor } from './channel/wait-for-channel-response';
import { FormInputProcessor } from './control/form-input';
import { IdentityResolveProcessor } from './internal/identity-resolve';
import { AssignAiBotToConversationProcessor } from './ai-bot/assign-ai-bot';
// 2.26 — Delegate a task from a workflow run to the autonomous Agent module.
import { DelegateToAgentProcessor } from './agent/delegate-to-agent';
// 2.10 — Slack + first-class Gmail/Sheets nodes.
import { SlackSendProcessor } from './messaging/slack';
import { GmailSendProcessor } from './messaging/gmail';
import { SheetsActionProcessor } from './integration/sheets';

export interface NodeProcessorContext {
  node: IWorkflowNode;
  config: Record<string, unknown>;
  execution: IUnifiedWorkflowExecution;
  workflow: IUnifiedWorkflow;
  variableResolver: VariableResolver;
  credentials: Record<string, Record<string, unknown>>;
  /**
   * Increment the engine's per-run AI-call counter. Provided so processors that
   * make MULTIPLE AI calls in one node (e.g. an agentic node that loops over
   * tool-call rounds) can charge each round against the run's AI budget — the
   * engine only auto-increments once per `ai` node otherwise. Optional so unit
   * tests / direct invocations don't have to supply it.
   */
  incrementAICall?: () => void;
  /**
   * Abort signal for the running execution. Wired by the engine to its
   * AbortController so long-running node work (HTTP fetches, AI calls) can be
   * cancelled mid-flight when the run is stopped (audit H13). Optional so unit
   * tests / direct invocations don't have to supply it.
   */
  abortSignal?: AbortSignal;
  /**
   * Dry-run (1.9 test loop). When true, side-effecting processors should
   * short-circuit before the real action (after validation/compliance) and
   * return a clearly-marked simulated output (`{ simulated: true, ... }`)
   * instead of sending/creating anything. Optional so normal runs and unit
   * tests omit it.
   */
  dryRun?: boolean;
  /**
   * Shared cost budget for the whole execution TREE (2.3 / H2). The engine sets
   * this to its own budget counters; a sub-workflow processor forwards it into
   * the child engine's ExecutionConfig so node/AI/HTTP usage across the entire
   * parent→sub-workflow tree is charged against ONE budget (the parent's hard
   * ceilings then bound the tree, not each level independently). Shape mirrors
   * `CostBudget` in the engine; typed structurally here to avoid an import cycle.
   * Optional so unit tests / direct invocations omit it.
   */
  costBudget?: { nodeExecutions: number; aiCalls: number; httpCalls: number };
}

export interface NodeProcessor {
  /**
   * Execute the node
   */
  execute(context: NodeProcessorContext): Promise<Record<string, unknown>>;

  /**
   * Validate node configuration
   */
  validate?(config: Record<string, unknown>): { valid: boolean; errors?: string[] };
}

export class NodeProcessorRegistry {
  private processors: Map<string, NodeProcessor> = new Map();

  constructor() {
    this.registerDefaultProcessors();
  }

  /**
   * Register a node processor
   */
  register(nodeSubType: string, processor: NodeProcessor): void {
    this.processors.set(nodeSubType, processor);
  }

  /**
   * Get a node processor
   */
  getProcessor(nodeSubType: string): NodeProcessor | null {
    return this.processors.get(nodeSubType) || null;
  }

  /**
   * Check if processor exists
   */
  hasProcessor(nodeSubType: string): boolean {
    return this.processors.has(nodeSubType);
  }

  /**
   * Get all registered processors
   */
  getAllProcessors(): string[] {
    return Array.from(this.processors.keys());
  }

  /**
   * Register default processors
   */
  private registerDefaultProcessors(): void {
    // WhatsApp processors
    this.register('send_whatsapp_text', new SendWhatsAppTextProcessor());
    this.register('send_whatsapp_image', new SendWhatsAppImageProcessor());
    this.register('send_whatsapp_template', new SendWhatsAppTemplateProcessor());
    this.register('send_whatsapp_video', new SendWhatsAppVideoProcessor());
    this.register('send_whatsapp_pdf', new SendWhatsAppPdfProcessor());
    this.register('send_whatsapp_buttons', new SendWhatsAppButtonsProcessor());
    this.register('send_whatsapp_list', new SendWhatsAppListProcessor());

    // CRM processors
    this.register('create_contact', new CreateContactProcessor());
    this.register('update_contact', new UpdateContactProcessor());
    this.register('create_deal', new CreateDealProcessor());
    this.register('update_deal', new UpdateDealProcessor());
    this.register('add_tag', new AddTagProcessor());
    this.register('remove_tag', new RemoveTagProcessor());
    this.register('assign_owner', new AssignOwnerProcessor());
    this.register('move_stage', new MoveStageProcessor());
    this.register('create_activity', new CreateActivityProcessor('activity'));
    // create_task is a sugar alias for create_activity with type=task
    // (adds dueInDays + assignTo owner|specific|creator handling).
    this.register('create_task', new CreateActivityProcessor('task'));
    // log_note: thin alias — type=note on a target record.
    this.register('log_note', new CreateActivityProcessor('note'));
    this.register('find_record', new FindRecordProcessor());
    // find_records: "find many" — list lookup whose output feeds the engine's
    // per-node "Run once per item" (forEach) fan-out.
    this.register('find_records', new FindRecordsProcessor());
    this.register('delete_record', new DeleteRecordProcessor());

    // Marketing Email processors
    this.register('send_marketing_email', new SendMarketingEmailProcessor());

    // AI processors
    this.register('ai_generate_text', new GenerateTextProcessor());
    this.register('ai_generate_image', new GenerateImageProcessor());
    this.register('ai_agentic', new AgenticProcessor());
    this.register('ai_chatbot', new ChatbotProcessor());
    this.register('chatbot', new ChatbotProcessor());

    // Real data scrapers (replacing the not-implemented stubs below).
    this.register('data_website_scrape', new WebsiteScrapeProcessor());
    this.register('website_scrape', new WebsiteScrapeProcessor());
    this.register('data_youtube_transcribe', new YoutubeTranscribeProcessor());
    this.register('youtube_transcribe', new YoutubeTranscribeProcessor());
    this.register('data_audio_transcribe', new AudioTranscribeProcessor());

    // Social data loaders (authenticated APIs + Reddit public JSON).
    this.register('data_reddit_scrape', new RedditScrapeProcessor());
    this.register('data_instagram_scrape', new InstagramScrapeProcessor());
    this.register('data_linkedin_scrape', new LinkedInScrapeProcessor());
    this.register('data_x_scrape', new XScrapeProcessor());
    this.register('data_pinterest_scrape', new PinterestScrapeProcessor());
    this.register('data_facebook', new FacebookScrapeProcessor());
    this.register('data_google_business', new GoogleBusinessScrapeProcessor());
    this.register('data_google_search', new GoogleSearchProcessor());
    this.register('data_ads_insights', new AdsInsightsProcessor()); // read-only metrics store
    this.register('data_marketing_analytics', new MarketingAnalyticsProcessor()); // read-only metrics store (GA4 / GSC / social)
    this.register('data_document', new DocumentProcessor());

    // Data-transform node set (H7 / TODO 2.2) — pure dropdown-driven reshapers,
    // no outbound calls / no eval. Engine reaches these via the data dispatch
    // (`data_<subType>` then bare `<subType>` candidate keys).
    this.register('data_edit_fields', new EditFieldsProcessor());
    this.register('edit_fields', new EditFieldsProcessor());
    this.register('data_dedupe', new DedupeProcessor());
    this.register('dedupe', new DedupeProcessor());
    this.register('data_merge', new MergeProcessor());
    this.register('merge', new MergeProcessor());
    this.register('data_sort', new SortProcessor());
    this.register('sort', new SortProcessor());
    this.register('data_aggregate', new AggregateProcessor());
    this.register('aggregate', new AggregateProcessor());
    this.register('data_date_time', new DateTimeProcessor());
    this.register('date_time', new DateTimeProcessor());

    // Real Telegram action (replacing the not-implemented stub below).
    this.register('send_telegram', new SendTelegramProcessor());
    this.register('send_conversational_email', new SendConversationalEmailProcessor());
    this.register('instagram_dm', new InstagramDMProcessor());

    // Extended AI processors (chatbot builder / audio bot).
    this.register('ai_chatbot_builder', new ChatbotBuilderProcessor());
    this.register('ai_audio_bot', new AudioBotProcessor());
    this.register('ai_generate_video', new GenerateVideoProcessor());

    // Integration processors
    this.register('http_request', new HttpRequestProcessor());
    this.register('integration_http_request', new HttpRequestProcessor());
    this.register('send_webhook', new SendWebhookProcessor());
    this.register('integration_notion', new NotionProcessor());
    this.register('integration_google_workspace', new GoogleWorkspaceProcessor());

    // Integrations hub processors (2026-06 expansion). Credentials resolve
    // via IntegrationConnection (brand → org chain) or workflow vault.
    this.register('integration_mailchimp', new MailchimpProcessor());
    this.register('integration_hubspot', new HubspotProcessor());
    this.register('integration_airtable', new AirtableProcessor());
    this.register('integration_zoho', new ZohoProcessor());
    this.register('integration_webflow', new WebflowProcessor());
    this.register('integration_blogger', new BloggerProcessor());
    this.register('integration_wordpress', new WordpressProcessor());
    this.register('integration_apollo', new ApolloProcessor());
    this.register('integration_semrush', new SemrushProcessor());
    this.register('integration_revenuecat', new RevenuecatProcessor());
    this.register('integration_n8n', new N8nProcessor());
    this.register('integration_shopify', new ShopifyProcessor());
    // Stripe read-only action node (subType stripe_action → integration_stripe_action).
    this.register('integration_stripe_action', new StripeProcessor());
    this.register('stripe_action', new StripeProcessor());

    // Social Media processors
    this.register('publish_social', new SocialPublishProcessor());

    // Logic processors
    this.register('smart_router', new SmartRouterProcessor());
    this.register('sub_workflow', new SubWorkflowProcessor());

    // SMS over the Twilio voice credential (H16).
    this.register('send_sms', new SendSmsProcessor());

    // Slack send (2.10 / H17) — bot token from the org's connected Slack inbox
    // channel (or credential vault / inline). Action-type → bare-key dispatch.
    this.register('slack_send', new SlackSendProcessor());

    // First-class Gmail + Sheets (2.10) — promoted out of the google_workspace
    // dispatcher; delegate to the shared google-workspace service layer.
    this.register('gmail_send', new GmailSendProcessor());
    this.register('sheets_action', new SheetsActionProcessor());

    // Voice processors (channel.voice.*)
    this.register('make_outbound_call', new MakeOutboundCallProcessor());
    this.register('wait_for_call_response', new WaitForCallResponseProcessor());
    this.register('gather_dtmf', new GatherDtmfProcessor());
    this.register('transfer_call', new TransferCallProcessor());
    this.register('hangup_call', new HangupCallProcessor());
    this.register('wait_for_channel_response', new WaitForChannelResponseProcessor());

    // Control — interactive form input (pause for a human, resume on submit).
    this.register('form_input', new FormInputProcessor());

    // Internal — identity resolver (B3 X2 via dynamic import).
    this.register('identity_resolve', new IdentityResolveProcessor());

    // AI bot (B3-4.5.5 / 4.5.8) — replaces the NotImplementedProcessor stub.
    this.register('assign_ai_bot_to_conversation', new AssignAiBotToConversationProcessor());

    // Agent ↔ workflow ties (2.26) — hand a task to the autonomous Agent module.
    this.register('delegate_to_agent', new DelegateToAgentProcessor());

    this.registerDataInputProcessors();
    this.registerStubProcessors();
  }

  /**
   * Generic passthrough for "input" data nodes — they emit their configured
   * literal as the node output for downstream consumption.
   */
  private registerDataInputProcessors(): void {
    const passthroughKeys = [
      'data_text_input',
      'data_image_input',
      'data_file_input',
      'text_input',
      'image_input',
      'file_input',
    ];
    for (const key of passthroughKeys) {
      this.register(key, new DataPassthroughProcessor());
    }
  }

  /**
   * Register stubs for subTypes that are reserved in the unified-workflow
   * model but whose real processor lives in Bundle 3 work (voice, identity
   * resolver, inbox assignment, channel-aware send). These throw a clear
   * "reserved for Bundle 3" error at execution time rather than crashing
   * with "No processor found".
   *
   * Remove a stub here when the real processor lands.
   */
  private registerStubProcessors(): void {
    // Only register a stub for subTypes that DON'T already have a real
    // processor registered. registerDefaultProcessors() runs first, so a
    // real registration takes priority — this guard prevents the stub from
    // shadowing it.
    const RESERVED_FOR_B3: Array<{ subType: string; label: string }> = [
      // Channel-aware router (B2 publishes the contract; B3 implements alongside identity resolver)
      { subType: 'send_channel_message', label: 'Send Channel Message' },
      // Inbox assignment (B3 owns inbox surface)
      { subType: 'assign_to_agent', label: 'Assign to Agent' },
      { subType: 'assign_to_group', label: 'Assign to Group' },
      // assign_ai_bot_to_conversation now has a real processor (B3-4.5.8).
    ];
    for (const { subType, label } of RESERVED_FOR_B3) {
      if (this.hasProcessor(subType)) continue; // real processor already registered
      this.register(
        subType,
        new NotImplementedProcessor(`${label} — reserved for Bundle 3 implementation`)
      );
    }
  }
}

export default NodeProcessorRegistry;
