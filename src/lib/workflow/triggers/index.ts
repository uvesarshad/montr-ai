/**
 * Workflow trigger entry points.
 *
 * Call these from code paths that *cause* events so workflows subscribed to
 * them fire automatically. Each helper is a thin wrapper over `dispatchTrigger`
 * — the shape of the call site is shorter than hand-rolling the event object.
 *
 * None of these throw — a trigger failure shouldn't break the business
 * operation that caused the event. Errors are logged and swallowed.
 */

import { dispatchTrigger, type DispatchResult } from './dispatch';

export { dispatchTrigger } from './dispatch';
export type {
  TriggerEvent,
  WebhookTriggerEvent,
  CrmRecordTriggerEvent,
  EmailTriggerEvent,
  DispatchResult,
} from './dispatch';

async function safeDispatch(event: Parameters<typeof dispatchTrigger>[0]): Promise<DispatchResult | null> {
  try {
    return await dispatchTrigger(event);
  } catch (err: unknown) {
    console.error(`[trigger-dispatch] ${event.kind} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------- CRM event helpers ----------

export async function emitCrmRecordCreated(opts: {
  entityType: 'contact' | 'company' | 'deal' | 'activity';
  record: Record<string, unknown>;
  actorUserId?: string;
}) {
  return safeDispatch({
    kind: 'record_created',
    entityType: opts.entityType,
    record: opts.record,
    actorUserId: opts.actorUserId,
  });
}

export async function emitCrmRecordUpdated(opts: {
  entityType: 'contact' | 'company' | 'deal' | 'activity';
  record: Record<string, unknown>;
  previousRecord: Record<string, unknown>;
  actorUserId?: string;
}) {
  return safeDispatch({
    kind: 'record_updated',
    entityType: opts.entityType,
    record: opts.record,
    previousRecord: opts.previousRecord,
    actorUserId: opts.actorUserId,
  });
}

export async function emitCrmFieldChanged(opts: {
  entityType: 'contact' | 'company' | 'deal' | 'activity';
  field: string;
  record: Record<string, unknown>;
  previousRecord: Record<string, unknown>;
  actorUserId?: string;
}) {
  return safeDispatch({
    kind: 'field_changed',
    entityType: opts.entityType,
    field: opts.field,
    record: opts.record,
    previousRecord: opts.previousRecord,
    actorUserId: opts.actorUserId,
  });
}

export async function emitCrmStageChanged(opts: {
  entityType: 'deal';
  stageId: string;
  record: Record<string, unknown>;
  previousRecord: Record<string, unknown>;
  actorUserId?: string;
}) {
  return safeDispatch({
    kind: 'stage_changed',
    entityType: opts.entityType,
    stageId: opts.stageId,
    record: opts.record,
    previousRecord: opts.previousRecord,
    actorUserId: opts.actorUserId,
  });
}

export async function emitCrmTagAdded(opts: {
  entityType: 'contact' | 'company' | 'deal';
  tagId: string;
  record: Record<string, unknown>;
  actorUserId?: string;
}) {
  return safeDispatch({
    kind: 'tag_added',
    entityType: opts.entityType,
    tagId: opts.tagId,
    record: opts.record,
    actorUserId: opts.actorUserId,
  });
}

export async function emitCrmTagRemoved(opts: {
  entityType: 'contact' | 'company' | 'deal';
  tagId: string;
  record: Record<string, unknown>;
  actorUserId?: string;
}) {
  return safeDispatch({
    kind: 'tag_removed',
    entityType: opts.entityType,
    tagId: opts.tagId,
    record: opts.record,
    actorUserId: opts.actorUserId,
  });
}

export async function emitCrmRecordDeleted(opts: {
  entityType: 'contact' | 'company' | 'deal' | 'activity';
  record: Record<string, unknown>;
  actorUserId?: string;
}) {
  return safeDispatch({
    kind: 'record_deleted',
    entityType: opts.entityType,
    record: opts.record,
    actorUserId: opts.actorUserId,
  });
}

export async function emitCrmDealWon(opts: {
  record: Record<string, unknown>;
  actorUserId?: string;
}) {
  return safeDispatch({
    kind: 'deal_won',
    entityType: 'deal',
    record: opts.record,
    actorUserId: opts.actorUserId,
  });
}

export async function emitCrmDealLost(opts: {
  record: Record<string, unknown>;
  actorUserId?: string;
}) {
  return safeDispatch({
    kind: 'deal_lost',
    entityType: 'deal',
    record: opts.record,
    actorUserId: opts.actorUserId,
  });
}

export async function emitCrmTaskCompleted(opts: {
  record: Record<string, unknown>;
  actorUserId?: string;
}) {
  return safeDispatch({
    kind: 'task_completed',
    entityType: 'activity',
    record: opts.record,
    actorUserId: opts.actorUserId,
  });
}

// ---------- Email event helpers ----------

export async function emitEmailOpened(opts: {
  emailId: string;
  contactId?: string;
  timestamp?: Date;
}) {
  return safeDispatch({
    kind: 'email_opened',
    emailId: opts.emailId,
    contactId: opts.contactId,
    timestamp: opts.timestamp,
  });
}

export async function emitEmailClicked(opts: {
  emailId: string;
  contactId?: string;
  linkUrl?: string;
  timestamp?: Date;
}) {
  return safeDispatch({
    kind: 'email_clicked',
    emailId: opts.emailId,
    contactId: opts.contactId,
    linkUrl: opts.linkUrl,
    timestamp: opts.timestamp,
  });
}

// ---------- AI Bot event helpers (B3-4.5.8) ----------

interface AiBotEmitInput {
  brandId?: string;
  aiBotId: string;
  conversationId: string;
  channel: 'whatsapp' | 'inbox' | 'voice';
  reason?: string;
  turnCount?: number;
  contactId?: string;
}

export async function emitAiBotEscalationRequested(opts: AiBotEmitInput) {
  return safeDispatch({
    kind: 'ai_bot.escalation_requested',
    ...opts,
  });
}

export async function emitAiBotConversationEnded(opts: AiBotEmitInput) {
  return safeDispatch({
    kind: 'ai_bot.conversation_ended',
    ...opts,
  });
}
