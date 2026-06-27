import crypto from 'node:crypto';
import { UnifiedWorkflow, IUnifiedWorkflow, TriggerSubType } from '../../db/models/unified-workflow.model';
import { enqueueExecution, QueueDepthExceededError, ExecutionQuotaExceededError, QuotaCheckUnavailableError } from '../queue/execution-queue';
import { getRedisConnection } from '../queue/connection';

// Fan-out batch size for enqueueForAll. Chunking the enqueue avoids slamming
// Redis with one massive Promise.all when an event matches hundreds of workflows
// (audit C1 — back-pressure on the dispatch path).
const ENQUEUE_BATCH_SIZE = 25;

// ============================================
// Event shapes
// ============================================

export type WebhookTriggerEvent = {
  kind: 'webhook';
  path: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
  /**
   * Optional provider-supplied delivery id (or a derived hash). When present it
   * is folded into the BullMQ jobId so a retried/duplicated delivery dedups to a
   * single execution per workflow. See `enqueueForAll` / idempotency (C8).
   */
  eventId?: string;
};

export type CrmRecordTriggerEvent = {
  kind:
    | 'record_created'
    | 'record_updated'
    | 'record_deleted'
    | 'field_changed'
    | 'stage_changed'
    | 'tag_added'
    | 'tag_removed'
    | 'deal_won'
    | 'deal_lost'
    | 'task_completed';
  entityType: 'contact' | 'company' | 'deal' | 'activity';
  record: Record<string, unknown>;
  previousRecord?: Record<string, unknown>;
  /** Populated for `field_changed`: the field that actually changed. */
  field?: string;
  /** Populated for `stage_changed` / `tag_added` / `tag_removed`. */
  stageId?: string;
  tagId?: string;
  actorUserId?: string;
};

export type EmailTriggerEvent = {
  kind: 'email_opened' | 'email_clicked';
  emailId: string;
  contactId?: string;
  linkUrl?: string;
  timestamp?: Date;
};

export type VoiceTriggerEvent = {
  kind: 'call_completed' | 'call_inbound';
  callSessionId: string;
  providerCallId: string;
  direction: 'inbound' | 'outbound';
  fromNumber: string;
  toNumber: string;
  fromContactId?: string;
  toContactId?: string;
  durationSec?: number;
  recordingUrl?: string;
  transcriptId?: string;
  /** Phone number doc id (used by `call_inbound` to scope by routed number). */
  phoneNumberId?: string;
  disposition?: Record<string, unknown>;
  brandId?: string;
};

/**
 * Inbound message on a channel — WhatsApp / Telegram / social DM / inbox email.
 * `kind` corresponds to the unified-workflow trigger subType:
 *   - `message_received`  — WhatsApp inbound
 *   - `keyword_match`     — inbound message matched configured keywords
 *   - `telegram_message`  — Telegram bot inbound message
 *   - `email_received`    — inbox-side email arrival (distinct from `email_opened`)
 */
export type ChannelMessageTriggerEvent = {
  kind: 'message_received' | 'keyword_match' | 'telegram_message' | 'email_received';
  channel: 'whatsapp' | 'telegram' | 'email';
  contactId?: string;
  /** Message text / subject — used for keyword matching when `kind === 'keyword_match'`. */
  text: string;
  /** Provider-specific identifiers (whatsapp message id, email message id, etc). */
  externalId?: string;
  /** Whichever WhatsAppAccount / EmailAccount / Telegram bot received the message. */
  accountId?: string;
  timestamp?: Date;
  /** Free-form provider metadata. */
  metadata?: Record<string, unknown>;
  /** Optional dedup id — defaults to `externalId` when not set (see dispatcher). */
  eventId?: string;
};

/**
 * Social mention / comment / DM / new follower / like across IG / LI / X / FB.
 */
export type SocialEventTriggerEvent = {
  kind: 'social_event';
  platform: 'instagram' | 'linkedin' | 'x' | 'facebook' | 'tiktok' | 'youtube' | 'pinterest';
  eventType: 'mention' | 'comment' | 'dm' | 'follower' | 'like';
  accountId?: string;
  contactId?: string;
  /** Post / comment / DM payload from the platform. */
  payload: Record<string, unknown>;
  timestamp?: Date;
};

/**
 * AI bot lifecycle event — fired by the bot runtime when an escalation is
 * requested OR a conversation completes. Per B3-4.5.8 enum reservations.
 */
export type AiBotTriggerEvent = {
  kind: 'ai_bot.escalation_requested' | 'ai_bot.conversation_ended';
  brandId?: string;
  aiBotId: string;
  conversationId: string;
  channel: 'whatsapp' | 'inbox' | 'voice';
  reason?: string;
  turnCount?: number;
  contactId?: string;
};

/**
 * Brand / topic mention detected by the keyword-monitor scrape (web / social / news).
 */
export type KeywordMonitorTriggerEvent = {
  kind: 'keyword_monitor';
  keyword: string;
  source: 'web' | 'social' | 'news';
  url?: string;
  excerpt?: string;
  timestamp?: Date;
};

/**
 * Inbound integrations-hub provider webhook (Shopify, RevenueCat, Calendly, Stripe).
 * Fired by /api/webhooks/{provider}/[connectionId] after verification.
 */
export type IntegrationWebhookTriggerEvent = {
  kind: 'integration_webhook';
  provider: 'shopify' | 'revenuecat' | 'calendly' | 'stripe';
  brandId?: string;
  connectionId: string;
  /** Provider topic / event type (e.g. orders/create, RENEWAL). */
  topic: string;
  payload: Record<string, unknown>;
  /**
   * Provider delivery id (Shopify `X-Shopify-Webhook-Id`, RevenueCat/Stripe
   * `event.id`, Calendly event uri/uuid).
   * Folded into the dedup key so a retried delivery fires one execution.
   */
  eventId?: string;
};

/**
 * Ad lead captured via the Meta Lead Ads / Google lead-form webhooks.
 * Fired AFTER the automatic CRM intake so syncStatus/contactId reflect the
 * outcome. Workflows match on trigger.config { platform?, formId?, campaignId? }.
 */
export type AdLeadTriggerEvent = {
  kind: 'ad_lead_captured';
  brandId?: string;
  leadId: string;
  platform: 'meta_ads' | 'google_ads';
  campaignId?: string;
  campaignName?: string;
  formId?: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  /** Raw answer map exactly as the platform delivered it. */
  fields: Record<string, string>;
  /** CRM intake outcome: synced | failed | skipped. */
  syncStatus: string;
  contactId?: string;
};

/**
 * Public / hosted form submission. Fired by the public form submit route AFTER
 * the submission is persisted (and after CRM intake, so `contactId` reflects the
 * created/matched contact when the form has CRM integration enabled).
 * Workflows match on trigger.config.formId — empty/absent matches any form.
 */
export type FormSubmissionTriggerEvent = {
  kind: 'form_submission';
  brandId?: string;
  formId: string;
  formName?: string;
  submissionId: string;
  /** Validated field answers exactly as stored on the submission. */
  fields: Record<string, unknown>;
  /** Set when CRM intake created/matched a contact for this submission. */
  contactId?: string;
};

/**
 * Ads performance signal — fired by the source-metrics worker (weekly-summary /
 * pacing checks). One event covers the three ads-performance trigger subtypes
 * via `subKind`. Org-scoped; `brandId` is set only when the producer scoped the
 * signal to a brand (the org-wide weekly roll-up leaves it undefined, in which
 * case any brand filter on a workflow is ignored).
 * Workflows match on trigger.type === subKind, optionally narrowed by
 * trigger.config.brandId. `eventId` (summary/anomaly id, or org+week) drives
 * idempotency so a re-run of the cron fires one execution per workflow.
 */
export type AdsPerformanceTriggerEvent = {
  kind: 'ads_performance';
  subKind: 'ads_budget_threshold' | 'ads_performance_anomaly' | 'ads_weekly_summary';
  brandId?: string;
  /** Stable id for idempotency: summary id / anomaly id / `${org}:${week}`. */
  eventId: string;
  /** Metrics payload exposed to the workflow as trigger data. */
  metrics: Record<string, unknown>;
};

export type TriggerEvent =
  | WebhookTriggerEvent
  | CrmRecordTriggerEvent
  | EmailTriggerEvent
  | VoiceTriggerEvent
  | ChannelMessageTriggerEvent
  | SocialEventTriggerEvent
  | KeywordMonitorTriggerEvent
  | AiBotTriggerEvent
  | IntegrationWebhookTriggerEvent
  | AdLeadTriggerEvent
  | FormSubmissionTriggerEvent
  | AdsPerformanceTriggerEvent;

export interface DispatchResult {
  matched: number;
  enqueued: number;
  skipped: number;
  errors: Array<{ workflowId: string; error: string }>;
}

// ============================================
// Top-level dispatcher
// ============================================

export async function dispatchTrigger(event: TriggerEvent): Promise<DispatchResult> {
  switch (event.kind) {
    case 'webhook':
      return dispatchWebhook(event);
    case 'email_opened':
    case 'email_clicked':
      return dispatchEmail(event);
    case 'call_completed':
    case 'call_inbound':
      return dispatchVoice(event);
    case 'message_received':
    case 'keyword_match':
    case 'telegram_message':
    case 'email_received':
      return dispatchChannelMessage(event);
    case 'social_event':
      return dispatchSocialEvent(event);
    case 'keyword_monitor':
      return dispatchKeywordMonitor(event);
    case 'ai_bot.escalation_requested':
    case 'ai_bot.conversation_ended':
      return dispatchAiBot(event);
    case 'integration_webhook':
      return dispatchIntegrationWebhook(event);
    case 'ad_lead_captured':
      return dispatchAdLead(event);
    case 'form_submission':
      return dispatchFormSubmission(event);
    case 'ads_performance':
      return dispatchAdsPerformance(event);
    default:
      return dispatchCrm(event);
  }
}

/**
 * Ad lead captured (Meta Lead Ads / Google lead forms). Workflows match on
 * trigger.config.platform, optionally narrowed by formId(s) / campaignId(s)
 * — both comma-tolerant like integration_webhook topics.
 */
async function dispatchAdLead(event: AdLeadTriggerEvent): Promise<DispatchResult> {
  const query: Record<string, unknown> = {
    status: 'active',
    'trigger.type': 'ad_lead_captured',
  };
  const workflows = await UnifiedWorkflow.find(query);

  const toList = (value: unknown): string[] | undefined => {
    if (Array.isArray(value)) return (value as string[]).map((v) => String(v).trim()).filter(Boolean);
    if (typeof value === 'string' && value.trim()) {
      return value.split(',').map((v) => v.trim()).filter(Boolean);
    }
    return undefined;
  };

  const eligible = workflows.filter((wf) => {
    const cfg = (wf.trigger?.config ?? {}) as Record<string, unknown>;
    if (cfg.platform && String(cfg.platform) !== event.platform) return false;
    const formIds = toList(cfg.formId);
    if (formIds && formIds.length > 0 && !formIds.includes(String(event.formId ?? ''))) return false;
    const campaignIds = toList(cfg.campaignId);
    if (campaignIds && campaignIds.length > 0 && !campaignIds.includes(String(event.campaignId ?? ''))) return false;
    if (cfg.brandId && String(cfg.brandId) !== String(event.brandId ?? '')) return false;
    return true;
  });

  const triggerData = {
    eventType: 'ad_lead_captured',
    leadId: event.leadId,
    platform: event.platform,
    campaignId: event.campaignId,
    campaignName: event.campaignName,
    formId: event.formId,
    email: event.email,
    phone: event.phone,
    firstName: event.firstName,
    lastName: event.lastName,
    fields: event.fields,
    syncStatus: event.syncStatus,
    contactId: event.contactId,
    brandId: event.brandId,
  };

  return enqueueForAll(eligible, triggerData, 'trigger-ad_lead_captured', {
    platform: event.platform,
    leadId: event.leadId,
  });
}

/**
 * Ads performance signal (weekly summary / budget pacing / WoW anomaly). The
 * event's `subKind` maps directly to the workflow trigger type, so one branch
 * serves all three ads-performance triggers. Workflows are optionally narrowed
 * by trigger.config.brandId — only applied when the event itself carries a
 * brandId (the org-wide weekly roll-up has none, and fires every matching
 * workflow regardless of its brand filter).
 */
async function dispatchAdsPerformance(event: AdsPerformanceTriggerEvent): Promise<DispatchResult> {
  const query: Record<string, unknown> = {
    status: 'active',
    'trigger.type': event.subKind,
  };
  const workflows = await UnifiedWorkflow.find(query);

  const eligible = workflows.filter((wf) => {
    const cfg = (wf.trigger?.config ?? {}) as Record<string, unknown>;
    // Brand filter only bites when the signal is brand-scoped.
    if (event.brandId && cfg.brandId && String(cfg.brandId) !== String(event.brandId)) return false;
    return true;
  });

  const triggerData = {
    eventType: event.subKind,
    brandId: event.brandId,
    ...event.metrics,
  };

  return enqueueForAll(eligible, triggerData, `trigger-${event.subKind}`, {
    brandId: event.brandId,
  }, undefined, event.eventId);
}

/**
 * Public / hosted form submission. Workflows match on trigger.config.formId —
 * an empty/absent formId (or a comma-separated list) accepts any form, exactly
 * one form, or a set of forms. submissionId is the idempotency key so a retried
 * submit fires one execution per workflow.
 */
async function dispatchFormSubmission(event: FormSubmissionTriggerEvent): Promise<DispatchResult> {
  const query: Record<string, unknown> = {
    status: 'active',
    'trigger.type': 'form_submission',
  };
  const workflows = await UnifiedWorkflow.find(query);

  const toList = (value: unknown): string[] | undefined => {
    if (Array.isArray(value)) return (value as string[]).map((v) => String(v).trim()).filter(Boolean);
    if (typeof value === 'string' && value.trim()) {
      return value.split(',').map((v) => v.trim()).filter(Boolean);
    }
    return undefined;
  };

  const eligible = workflows.filter((wf) => {
    const cfg = (wf.trigger?.config ?? {}) as Record<string, unknown>;
    const formIds = toList(cfg.formId);
    if (formIds && formIds.length > 0 && !formIds.includes(String(event.formId))) return false;
    if (cfg.brandId && String(cfg.brandId) !== String(event.brandId ?? '')) return false;
    return true;
  });

  const triggerData = {
    eventType: 'form_submission',
    formId: event.formId,
    formName: event.formName,
    submissionId: event.submissionId,
    fields: event.fields,
    contactId: event.contactId,
    brandId: event.brandId,
  };

  return enqueueForAll(eligible, triggerData, 'trigger-form_submission', {
    formId: event.formId,
    contactId: event.contactId,
  }, undefined, event.submissionId);
}

/**
 * Integrations-hub provider webhook (Shopify, RevenueCat). Workflows match on
 * trigger.config.provider, optionally narrowed by topic(s) and connectionId.
 */
async function dispatchIntegrationWebhook(event: IntegrationWebhookTriggerEvent): Promise<DispatchResult> {
  const query: Record<string, unknown> = {
    status: 'active',
    'trigger.type': 'integration_webhook',
  };
  const workflows = await UnifiedWorkflow.find(query);

  const eligible = workflows.filter((wf) => {
    const cfg = (wf.trigger?.config ?? {}) as Record<string, unknown>;
    if (cfg.provider && String(cfg.provider) !== event.provider) return false;
    if (cfg.connectionId && String(cfg.connectionId) !== event.connectionId) return false;
    // topics may be an array or a comma-separated string (canvas node input).
    const topics = Array.isArray(cfg.topics)
      ? (cfg.topics as string[])
      : typeof cfg.topics === 'string' && cfg.topics.trim()
        ? cfg.topics.split(',').map((t) => t.trim()).filter(Boolean)
        : undefined;
    if (topics && topics.length > 0 && !topics.includes(event.topic)) return false;
    return true;
  });

  const triggerData = {
    eventType: 'integration_webhook',
    provider: event.provider,
    connectionId: event.connectionId,
    topic: event.topic,
    payload: event.payload,
    brandId: event.brandId,
  };

  return enqueueForAll(eligible, triggerData, 'trigger-integration_webhook', {
    provider: event.provider,
    topic: event.topic,
  }, undefined, event.eventId);
}

async function dispatchAiBot(event: AiBotTriggerEvent): Promise<DispatchResult> {
  const query: Record<string, unknown> = {
    status: 'active',
    'trigger.type': event.kind,
  };
  const workflows = await UnifiedWorkflow.find(query);

  const eligible = workflows.filter((wf) => {
    const cfg = wf.trigger?.config as Record<string, unknown> | undefined;
    if (!cfg) return true;
    if (cfg.aiBotId && String(cfg.aiBotId) !== String(event.aiBotId)) return false;
    if (cfg.channel && String(cfg.channel) !== event.channel) return false;
    if (cfg.brandId && String(cfg.brandId) !== String(event.brandId ?? '')) return false;
    return true;
  });

  const triggerData = {
    eventType: event.kind,
    aiBotId: event.aiBotId,
    conversationId: event.conversationId,
    channel: event.channel,
    reason: event.reason,
    turnCount: event.turnCount,
    contactId: event.contactId,
    brandId: event.brandId,
  };

  return enqueueForAll(eligible, triggerData, `trigger-${event.kind}`, {
    aiBotId: event.aiBotId,
    conversationId: event.conversationId,
  });
}

// ============================================
// Per-kind dispatchers
// ============================================

async function dispatchWebhook(event: WebhookTriggerEvent): Promise<DispatchResult> {
  const query: Record<string, unknown> = {
    status: 'active',
    'trigger.type': 'webhook',
    'trigger.config.webhookPath': event.path,
  };
  const workflows = await UnifiedWorkflow.find(query);

  const triggerData = {
    body: event.body,
    headers: event.headers,
    path: event.path,
  };

  return enqueueForAll(workflows, triggerData, 'trigger-webhook', {
    webhookPath: event.path,
  }, undefined, event.eventId);
}

async function dispatchCrm(event: CrmRecordTriggerEvent): Promise<DispatchResult> {
  const triggerType: TriggerSubType = event.kind;
  const query: Record<string, unknown> = {
    status: 'active',
    'trigger.type': triggerType,
  };

  // Scope by entity type if the workflow declared one.
  const entityFilter = {
    $or: [
      { 'trigger.config.entityType': { $exists: false } },
      { 'trigger.config.entityType': null },
      { 'trigger.config.entityType': event.entityType },
    ],
  };
  Object.assign(query, entityFilter);

  const workflows = await UnifiedWorkflow.find(query);

  // Narrow further with trigger-specific filters that Mongo can't easily express.
  const eligible = workflows.filter(wf => matchesCrmEventFilters(wf, event));

  const triggerData = {
    eventType: event.kind,
    entityType: event.entityType,
    record: event.record,
    previousRecord: event.previousRecord,
    field: event.field,
    stageId: event.stageId,
    tagId: event.tagId,
    actorUserId: event.actorUserId,
  };

  return enqueueForAll(eligible, triggerData, `trigger-${event.kind}`, {
    entityType: event.entityType,
    recordId: event.record?._id?.toString?.() || event.record?.id,
  }, event.actorUserId);
}

async function dispatchEmail(event: EmailTriggerEvent): Promise<DispatchResult> {
  const query: Record<string, unknown> = {
    status: 'active',
    'trigger.type': event.kind,
  };
  const workflows = await UnifiedWorkflow.find(query);

  const triggerData = {
    eventType: event.kind,
    emailId: event.emailId,
    contactId: event.contactId,
    linkUrl: event.linkUrl,
    timestamp: event.timestamp ?? new Date(),
  };

  return enqueueForAll(workflows, triggerData, `trigger-${event.kind}`, {
    emailId: event.emailId,
  });
}

async function dispatchVoice(event: VoiceTriggerEvent): Promise<DispatchResult> {
  const query: Record<string, unknown> = {
    status: 'active',
    'trigger.type': event.kind,
  };
  const workflows = await UnifiedWorkflow.find(query);

  const eligible = workflows.filter(wf => matchesVoiceEventFilters(wf, event));

  const triggerData = {
    eventType: event.kind,
    callSessionId: event.callSessionId,
    providerCallId: event.providerCallId,
    direction: event.direction,
    fromNumber: event.fromNumber,
    toNumber: event.toNumber,
    fromContactId: event.fromContactId,
    toContactId: event.toContactId,
    durationSec: event.durationSec,
    recordingUrl: event.recordingUrl,
    transcriptId: event.transcriptId,
    phoneNumberId: event.phoneNumberId,
    disposition: event.disposition,
    brandId: event.brandId,
  };

  const result = await enqueueForAll(eligible, triggerData, `trigger-${event.kind}`, {
    callSessionId: event.callSessionId,
    contactId: event.fromContactId ?? event.toContactId,
  });

  // Event-resumer (FUP-2): in parallel with firing new workflow executions,
  // resume any paused-for-event executions whose subscription key matches
  // this contact. Keyed on the resolved contact id so a `wait_for_call_response`
  // node bound to `contactId` lights up when ITS contact calls back.
  const resumeKey = event.fromContactId ?? event.toContactId;
  if (resumeKey) {
    try {
      const { resumePausedExecutionsForEvent } = await import('./event-resumer');
      await resumePausedExecutionsForEvent({
        kind: event.kind,
        key: resumeKey,
        payload: triggerData,
      });
    } catch (err) {
      console.error('[dispatch] event-resumer call failed:', err);
    }
  }

  return result;
}

/**
 * Inbound channel message — WhatsApp / Telegram / social DM / inbox email.
 * Workflows that triggered on `kind` AND (when present) configured an
 * `accountId` filter match this message.
 *
 * For `keyword_match`, also runs the configured keyword filter against the
 * message text (case-insensitive contains by default).
 */
async function dispatchChannelMessage(event: ChannelMessageTriggerEvent): Promise<DispatchResult> {
  const query: Record<string, unknown> = {
    status: 'active',
    'trigger.type': event.kind,
  };
  const workflows = await UnifiedWorkflow.find(query);

  const eligible = workflows.filter(wf => matchesChannelMessageFilters(wf, event));

  const triggerData = {
    eventType: event.kind,
    channel: event.channel,
    contactId: event.contactId,
    text: event.text,
    externalId: event.externalId,
    accountId: event.accountId,
    metadata: event.metadata,
    timestamp: event.timestamp ?? new Date(),
  };

  return enqueueForAll(eligible, triggerData, `trigger-${event.kind}`, {
    channel: event.channel,
    contactId: event.contactId,
  }, undefined, event.eventId ?? event.externalId);
}

function matchesChannelMessageFilters(wf: IUnifiedWorkflow, event: ChannelMessageTriggerEvent): boolean {
  const cfg = (wf.trigger?.config ?? {}) as Record<string, unknown>;

  if (cfg.accountId && event.accountId && String(cfg.accountId) !== String(event.accountId)) {
    return false;
  }

  if (event.kind === 'keyword_match') {
    const keywords = Array.isArray(cfg.keywords) ? (cfg.keywords as string[]) : [];
    if (keywords.length === 0) return true; // workflow accepts any inbound when no keywords set
    const matchType = (cfg.matchType as string | undefined) ?? 'contains';
    const haystack = (cfg.caseSensitive ? event.text : event.text.toLowerCase());
    return keywords.some(k => {
      const needle = cfg.caseSensitive ? k : k.toLowerCase();
      if (matchType === 'exact') return haystack === needle;
      if (matchType === 'regex') {
        try { return new RegExp(needle, cfg.caseSensitive ? '' : 'i').test(event.text); }
        catch { return false; }
      }
      return haystack.includes(needle);
    });
  }

  return true;
}

/**
 * Social mention / comment / DM / new follower / like.
 * Workflows match when `trigger.config.platforms` contains the event platform
 * AND `trigger.config.eventType` matches (or both filters are absent).
 */
async function dispatchSocialEvent(event: SocialEventTriggerEvent): Promise<DispatchResult> {
  const query: Record<string, unknown> = {
    status: 'active',
    'trigger.type': 'social_event',
  };
  const workflows = await UnifiedWorkflow.find(query);

  const eligible = workflows.filter(wf => {
    const cfg = (wf.trigger?.config ?? {}) as Record<string, unknown>;
    const platforms = Array.isArray(cfg.platforms) ? (cfg.platforms as string[]) : undefined;
    if (platforms && platforms.length > 0 && !platforms.includes(event.platform)) return false;
    const eventType = cfg.eventType as string | undefined;
    if (eventType && eventType !== event.eventType) return false;
    return true;
  });

  const triggerData = {
    eventType: 'social_event',
    platform: event.platform,
    socialEventType: event.eventType,
    accountId: event.accountId,
    contactId: event.contactId,
    payload: event.payload,
    timestamp: event.timestamp ?? new Date(),
  };

  return enqueueForAll(eligible, triggerData, 'trigger-social_event', {
    platform: event.platform,
    eventType: event.eventType,
  });
}

/**
 * Brand / topic monitor — fires when the scrape worker detects a mention
 * matching one of the configured keywords across web / social / news.
 */
async function dispatchKeywordMonitor(event: KeywordMonitorTriggerEvent): Promise<DispatchResult> {
  const query: Record<string, unknown> = {
    status: 'active',
    'trigger.type': 'keyword_monitor',
  };
  const workflows = await UnifiedWorkflow.find(query);

  const eligible = workflows.filter(wf => {
    const cfg = (wf.trigger?.config ?? {}) as Record<string, unknown>;
    const sources = Array.isArray(cfg.sources) ? (cfg.sources as string[]) : undefined;
    if (sources && sources.length > 0 && !sources.includes(event.source)) return false;
    const keywords = Array.isArray(cfg.keywords) ? (cfg.keywords as string[]) : undefined;
    if (keywords && keywords.length > 0) {
      const hit = keywords.some(k => event.keyword.toLowerCase().includes(k.toLowerCase()));
      if (!hit) return false;
    }
    return true;
  });

  const triggerData = {
    eventType: 'keyword_monitor',
    keyword: event.keyword,
    source: event.source,
    url: event.url,
    excerpt: event.excerpt,
    timestamp: event.timestamp ?? new Date(),
  };

  return enqueueForAll(eligible, triggerData, 'trigger-keyword_monitor', {
    keyword: event.keyword,
  });
}

// ============================================
// Per-workflow filter matching
// ============================================
//
// Mongo does the coarse match (type + entity). These functions apply the
// specific runtime filters that are awkward to express as Mongo queries
// (field names, previous-vs-current value comparisons, stage ids, etc).

function matchesVoiceEventFilters(wf: IUnifiedWorkflow, event: VoiceTriggerEvent): boolean {
  const cfg = (wf.trigger?.config || {}) as Record<string, unknown>;
  // Scope by direction if the workflow declared one.
  if (typeof cfg.direction === 'string' && cfg.direction !== event.direction) {
    return false;
  }
  // Scope to a specific phone number (e.g. only fire for calls to the sales line).
  if (typeof cfg.phoneNumberId === 'string' && cfg.phoneNumberId !== event.phoneNumberId) {
    return false;
  }
  // Min duration filter (skip dropped calls).
  if (typeof cfg.minDurationSec === 'number') {
    if (typeof event.durationSec !== 'number' || event.durationSec < cfg.minDurationSec) {
      return false;
    }
  }
  // Brand scope (agency mode).
  if (typeof cfg.brandId === 'string' && event.brandId && cfg.brandId !== event.brandId) {
    return false;
  }
  return true;
}

function matchesCrmEventFilters(wf: IUnifiedWorkflow, event: CrmRecordTriggerEvent): boolean {
  const cfg = (wf.trigger?.config || {}) as Record<string, unknown>;

  switch (event.kind) {
    case 'field_changed': {
      const cfgField = typeof cfg.field === 'string' ? cfg.field : undefined;
      if (cfgField && cfgField !== event.field) return false;
      if (cfg.fromValue !== undefined && event.previousRecord?.[cfgField ?? ''] !== cfg.fromValue) return false;
      if (cfg.toValue !== undefined && event.record?.[cfgField ?? ''] !== cfg.toValue) return false;
      return true;
    }
    case 'stage_changed':
      if (cfg.stageId && String(cfg.stageId) !== String(event.stageId)) return false;
      return true;
    case 'tag_added':
    case 'tag_removed':
      if (cfg.tagId && String(cfg.tagId) !== String(event.tagId)) return false;
      return true;
    default:
      return true;
  }
}

// ============================================
// Execution guards (ported from the legacy CRM workflow engine)
// ============================================
//
// A workflow can declare run-once / max-executions / cooldown limits. These are
// enforced here so they apply uniformly to EVERY event dispatch path, not just
// CRM. Returns a reason string when the workflow should be skipped, else null.

function executionGuardReason(wf: IUnifiedWorkflow): string | null {
  const count = wf.executionCount ?? 0;

  if (wf.runOnce && count > 0) {
    return 'runOnce: already executed';
  }
  if (typeof wf.maxExecutions === 'number' && wf.maxExecutions > 0 && count >= wf.maxExecutions) {
    return `maxExecutions: ${count}/${wf.maxExecutions} reached`;
  }
  if (typeof wf.cooldownMinutes === 'number' && wf.cooldownMinutes > 0 && wf.lastTriggeredAt) {
    const cooldownMs = wf.cooldownMinutes * 60 * 1000;
    const elapsed = Date.now() - new Date(wf.lastTriggeredAt).getTime();
    if (elapsed < cooldownMs) {
      return `cooldown: ${Math.ceil((cooldownMs - elapsed) / 1000)}s remaining`;
    }
  }
  return null;
}

// ============================================
// Shared enqueue loop
// ============================================

/**
 * Build a BullMQ-safe idempotency key from a workflow id, event kind, and a
 * provider delivery id. The key maps to the job's `jobId`, so a retried/
 * duplicated delivery resolves to the SAME job and runs once (C8).
 *
 * BullMQ has no character restrictions on jobId, but very long ids bloat Redis
 * keys — hash anything over ~120 chars (and any whitespace) down to a digest.
 */
function buildIdempotencyKey(workflowId: string, eventKind: string, eventId: string): string {
  const raw = `${workflowId}:${eventKind}:${eventId}`;
  if (raw.length > 120 || /\s/.test(raw)) {
    const digest = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
    return `${workflowId}:${eventKind}:${digest}`;
  }
  return raw;
}

/**
 * Notify an org's workflow owner that the monthly execution quota is exhausted,
 * at most once per day per org. The Redis SET NX EX guard makes the
 * once-per-day limit hold across web/worker processes; when Redis is absent we
 * fall through and notify (the notification layer's own dedupeKey still de-dups
 * within a process). Best-effort — never throws into the dispatch path.
 */
async function notifyOrgQuotaExceeded(
  organizationId: string,
  userId: string,
  err: ExecutionQuotaExceededError
): Promise<void> {
  const dayKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const guardKey = `wf:quota-notify:${organizationId}:${dayKey}`;
  const redis = getRedisConnection();
  if (redis) {
    const set = await redis.set(guardKey, '1', 'EX', 86_400, 'NX');
    if (set === null) return; // already notified today
  }
  const { notifyUser } = await import('@/lib/notifications/notification-service');
  await notifyUser(userId, {
    type: 'plan.execution_quota_reached',
    title: 'Monthly automation limit reached',
    body: `Your workflows hit the monthly execution limit (${err.current}/${err.limit}). New runs are paused until you upgrade or the limit resets next month.`,
    actionUrl: '/pricing',
    actionLabel: 'Upgrade plan',
    dedupeKey: guardKey,
  });
}

async function enqueueForAll(
  workflows: IUnifiedWorkflow[],
  triggerData: Record<string, unknown>,
  source: string,
  initialVariables: Record<string, unknown> = {},
  actorUserIdOverride?: string,
  /**
   * Provider delivery id. When present, each enqueued job gets a deterministic
   * `idempotencyKey` so duplicate deliveries dedup to one execution per workflow.
   */
  eventId?: string
): Promise<DispatchResult> {
  const result: DispatchResult = { matched: workflows.length, enqueued: 0, skipped: 0, errors: [] };
  if (workflows.length === 0) return result;

  // Enqueue in batches so a fan-out to hundreds of workflows doesn't issue one
  // huge Promise.all against Redis/Mongo at once (audit C1).
  for (let i = 0; i < workflows.length; i += ENQUEUE_BATCH_SIZE) {
  const batch = workflows.slice(i, i + ENQUEUE_BATCH_SIZE);
  await Promise.all(
    batch.map(async wf => {
      // Pre-filter: honour run-once / max-executions / cooldown guards.
      const guard = executionGuardReason(wf);
      if (guard) {
        result.skipped++;
        return;
      }

      try {
        const workflowId = wf._id.toString();
        const idempotencyKey = eventId
          ? buildIdempotencyKey(workflowId, source.replace(/^trigger-/, ''), eventId)
          : undefined;
        await enqueueExecution({
          workflowId,
          userId: actorUserIdOverride || wf.createdById.toString(),
          triggerData,
          initialVariables,
          source,
          idempotencyKey,
        });
        result.enqueued++;
        // Fire-and-forget: stamp the trigger time so the cooldown guard works on
        // the next event. Failures here must never fail the dispatch.
        UnifiedWorkflow.updateOne(
          { _id: wf._id },
          { $set: { lastTriggeredAt: new Date() } }
        ).exec().catch(() => { /* best-effort */ });
      } catch (err: unknown) {
        // Org over its per-org queued-depth cap — skip this run (don't crash the
        // dispatch/webhook path). This is the fairness back-pressure (audit C1).
        if (err instanceof QueueDepthExceededError) {
          result.skipped++;
          console.warn(`[dispatch] Skipping workflow ${wf._id.toString()} — ${err.message}`);
          return;
        }
        // Org over its monthly execution quota — skip + notify the owner at most
        // once/day (audit H18). Don't crash the trigger fan-out.
        if (err instanceof ExecutionQuotaExceededError) {
          result.skipped++;
          console.warn(`[dispatch] Skipping workflow ${wf._id.toString()} — ${err.message}`);
          void notifyOrgQuotaExceeded(
            wf.createdById.toString(),
            wf.createdById.toString(),
            err
          ).catch(() => { /* best-effort */ });
          return;
        }
        // Quota check infra failure — fail CLOSED: skip the run (don't allow an
        // unmetered execution through on a transient DB error).
        if (err instanceof QuotaCheckUnavailableError) {
          result.skipped++;
          console.warn(`[dispatch] Skipping workflow ${wf._id.toString()} — quota check unavailable (failing closed).`);
          return;
        }
        result.skipped++;
        result.errors.push({
          workflowId: wf._id.toString(),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })
  );
  }

  return result;
}
