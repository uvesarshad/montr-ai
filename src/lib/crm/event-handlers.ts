/**
 * CRM Event Handlers
 *
 * Connects the event bus to workflow engine and webhook delivery.
 * Registers handlers that trigger workflows and webhooks when CRM events occur.
 */

import { crmEventBus, CrmEventType, CrmEventData } from './events';
import { triggerWorkflows } from './workflow-engine';
import { triggerWebhooks, buildWebhookPayload } from './webhook-delivery';
import { WebhookEvent } from '@/lib/db/models/crm/webhook.model';
import { dispatchTrigger, type CrmRecordTriggerEvent } from '@/lib/workflow/triggers';

/**
 * Initialize event handlers for workflows and webhooks
 */
export function initializeCrmEventHandlers(): void {
  // Register a wildcard handler that triggers both workflows and webhooks
  crmEventBus.on('*', handleCrmEvent);

  console.log('CRM event handlers initialized');
}

/**
 * Main event handler that triggers workflows and webhooks
 */
async function handleCrmEvent(
  eventType: CrmEventType,
  data: CrmEventData
): Promise<void> {
  try {
    // Map event type to workflow trigger type
    const triggerType = mapEventToTriggerType(eventType);

    // Trigger workflows
    if (triggerType) {
      await triggerWorkflows(triggerType, data.entityType, data);
    }

    // Trigger webhooks
    const payload = buildWebhookPayload(
      eventType as WebhookEvent,
      data.entity,
      {
        entityType: data.entityType,
        entityId: data.entityId,
        changes: data.changes,
        userId: data.userId,
      }
    );

    await triggerWebhooks(
      eventType as WebhookEvent,
      payload
    );

    // Fan out to the UNIFIED workflow engine (the target automation system).
    // Legacy CRM workflows above stay functional until migrated; new builds
    // should subscribe via unified-workflow CRM trigger nodes.
    await dispatchToUnified(eventType, data);
  } catch (error) {
    console.error(`Error handling CRM event ${eventType}:`, error);
  }
}

/**
 * Bridge: CRM event bus → unified trigger dispatcher.
 *
 * Reconstructs `previousRecord` from the update's change map so
 * `field_changed` from/to filters can match. Errors are logged and swallowed
 * inside `dispatchTrigger` wrappers — a trigger failure never breaks the
 * mutation that caused it.
 */
async function dispatchToUnified(eventType: CrmEventType, data: CrmEventData): Promise<void> {
  // The unified CRM trigger shape only covers core record entities.
  if (
    data.entityType !== 'contact' &&
    data.entityType !== 'company' &&
    data.entityType !== 'deal' &&
    data.entityType !== 'activity'
  ) {
    return;
  }
  const entityType = data.entityType;
  const base = {
    entityType,
    record: data.entity,
    actorUserId: data.userId,
  } as const;

  const safeDispatch = async (event: CrmRecordTriggerEvent) => {
    try {
      await dispatchTrigger(event);
    } catch (err) {
      console.error(`[crm→unified] dispatch ${event.kind} failed:`, err instanceof Error ? err.message : err);
    }
  };

  const previousRecord = buildPreviousRecord(data.entity, data.changes);

  switch (eventType) {
    case 'contact.created':
    case 'company.created':
    case 'deal.created':
    case 'activity.created':
      await safeDispatch({ kind: 'record_created', ...base });
      break;
    case 'contact.updated':
    case 'company.updated':
    case 'deal.updated': {
      await safeDispatch({ kind: 'record_updated', ...base, previousRecord });
      // Per-field fan-out so `field_changed` triggers with from/to filters match.
      for (const field of Object.keys(data.changes ?? {})) {
        await safeDispatch({ kind: 'field_changed', ...base, previousRecord, field });
      }
      break;
    }
    case 'contact.deleted':
    case 'company.deleted':
    case 'deal.deleted':
      await safeDispatch({ kind: 'record_deleted', ...base });
      break;
    case 'deal.stage_changed':
      await safeDispatch({
        kind: 'stage_changed',
        ...base,
        previousRecord,
        stageId: String((data.entity as { stageId?: unknown }).stageId ?? ''),
      });
      break;
    case 'deal.won':
      await safeDispatch({ kind: 'deal_won', ...base });
      break;
    case 'deal.lost':
      await safeDispatch({ kind: 'deal_lost', ...base });
      break;
    case 'task.completed':
      await safeDispatch({ kind: 'task_completed', ...base });
      break;
    case 'tag.added':
    case 'tag.removed':
      await safeDispatch({
        kind: eventType === 'tag.added' ? 'tag_added' : 'tag_removed',
        ...base,
        tagId: String(data.metadata?.tagId ?? ''),
      });
      break;
    default:
      // Marketing-email + email events have their own unified trigger paths.
      break;
  }
}

/** Rebuild the pre-update record by applying each change's `from` value. */
function buildPreviousRecord(
  entity: Record<string, unknown>,
  changes?: Record<string, { from: unknown; to: unknown }>
): Record<string, unknown> {
  if (!changes) return entity;
  const prev: Record<string, unknown> = { ...entity };
  for (const [field, change] of Object.entries(changes)) {
    prev[field] = change.from;
  }
  return prev;
}

/**
 * Map CRM event types to workflow trigger types
 */
function mapEventToTriggerType(eventType: CrmEventType): string | null {
  const mapping: Record<string, string> = {
    'contact.created': 'record_created',
    'contact.updated': 'record_updated',
    'contact.deleted': 'record_deleted',
    'company.created': 'record_created',
    'company.updated': 'record_updated',
    'company.deleted': 'record_deleted',
    'deal.created': 'record_created',
    'deal.updated': 'record_updated',
    'deal.deleted': 'record_deleted',
    'deal.stage_changed': 'stage_changed',
    'deal.won': 'deal_won',
    'deal.lost': 'deal_lost',
    'tag.added': 'tag_added',
    'tag.removed': 'tag_removed',
    'activity.created': 'activity_created',
    'task.completed': 'task_completed',
    // Marketing Email Mappings
    'marketing_email.opened': 'marketing_email_opened',
    'marketing_email.clicked': 'marketing_email_clicked',
    'marketing_email.bounced': 'marketing_email_bounced',
    'marketing_email.unsubscribed': 'marketing_email_unsubscribed',
  };

  return mapping[eventType] || null;
}

/**
 * Helper functions to emit CRM events
 * These should be called from API routes when CRM records are modified
 */

export async function emitContactCreated(
  contact: { _id: { toString(): string } },
  userId?: string
): Promise<void> {
  await crmEventBus.emit('contact.created', {
    entityType: 'contact',
    entityId: contact._id.toString(),
    entity: contact,
    userId,
  });
}

export async function emitContactUpdated(
  contact: { _id: { toString(): string } },
  changes?: Record<string, { from: unknown; to: unknown }>,
  userId?: string
): Promise<void> {
  await crmEventBus.emit('contact.updated', {
    entityType: 'contact',
    entityId: contact._id.toString(),
    entity: contact,
    changes,
    userId,
  });
}

export async function emitContactDeleted(
  contact: { _id: { toString(): string } },
  userId?: string
): Promise<void> {
  await crmEventBus.emit('contact.deleted', {
    entityType: 'contact',
    entityId: contact._id.toString(),
    entity: contact,
    userId,
  });
}

export async function emitCompanyCreated(
  company: { _id: { toString(): string } },
  userId?: string
): Promise<void> {
  await crmEventBus.emit('company.created', {
    entityType: 'company',
    entityId: company._id.toString(),
    entity: company,
    userId,
  });
}

export async function emitCompanyUpdated(
  company: { _id: { toString(): string } },
  changes?: Record<string, { from: unknown; to: unknown }>,
  userId?: string
): Promise<void> {
  await crmEventBus.emit('company.updated', {
    entityType: 'company',
    entityId: company._id.toString(),
    entity: company,
    changes,
    userId,
  });
}

export async function emitCompanyDeleted(
  company: { _id: { toString(): string } },
  userId?: string
): Promise<void> {
  await crmEventBus.emit('company.deleted', {
    entityType: 'company',
    entityId: company._id.toString(),
    entity: company,
    userId,
  });
}

export async function emitDealCreated(
  deal: { _id: { toString(): string }; stageId?: { toString(): string } },
  userId?: string
): Promise<void> {
  await crmEventBus.emit('deal.created', {
    entityType: 'deal',
    entityId: deal._id.toString(),
    entity: deal,
    userId,
  });
}

export async function emitDealUpdated(
  deal: { _id: { toString(): string }; stageId?: { toString(): string } },
  changes?: Record<string, { from: unknown; to: unknown }>,
  userId?: string
): Promise<void> {
  await crmEventBus.emit('deal.updated', {
    entityType: 'deal',
    entityId: deal._id.toString(),
    entity: deal,
    changes,
    userId,
  });
}

export async function emitDealStageChanged(
  deal: { _id: { toString(): string }; stageId?: { toString(): string } },
  previousStageId: string,
  userId?: string
): Promise<void> {
  await crmEventBus.emit('deal.stage_changed', {
    entityType: 'deal',
    entityId: deal._id.toString(),
    entity: deal,
    previousStageId,
    changes: {
      stageId: {
        from: previousStageId,
        to: deal.stageId?.toString() ?? '',
      },
    },
    userId,
  });
}

export async function emitDealWon(
  deal: { _id: { toString(): string }; stageId?: { toString(): string } },
  userId?: string
): Promise<void> {
  await crmEventBus.emit('deal.won', {
    entityType: 'deal',
    entityId: deal._id.toString(),
    entity: deal,
    userId,
  });
}

export async function emitDealLost(
  deal: { _id: { toString(): string }; stageId?: { toString(): string } },
  userId?: string
): Promise<void> {
  await crmEventBus.emit('deal.lost', {
    entityType: 'deal',
    entityId: deal._id.toString(),
    entity: deal,
    userId,
  });
}

export async function emitDealDeleted(
  deal: { _id: { toString(): string }; stageId?: { toString(): string } },
  userId?: string
): Promise<void> {
  await crmEventBus.emit('deal.deleted', {
    entityType: 'deal',
    entityId: deal._id.toString(),
    entity: deal,
    userId,
  });
}

export async function emitActivityCreated(
  activity: { _id: { toString(): string } },
  userId?: string
): Promise<void> {
  await crmEventBus.emit('activity.created', {
    entityType: 'activity',
    entityId: activity._id.toString(),
    entity: activity,
    userId,
  });
}

export async function emitTaskCompleted(
  task: { _id: { toString(): string } },
  userId?: string
): Promise<void> {
  await crmEventBus.emit('task.completed', {
    entityType: 'activity',
    entityId: task._id.toString(),
    entity: task,
    userId,
  });
}

export async function emitTagAdded(
  entityType: 'contact' | 'company' | 'deal',
  entity: { _id: { toString(): string } },
  tagId: string,
  userId?: string
): Promise<void> {
  await crmEventBus.emit('tag.added', {
    entityType,
    entityId: entity._id.toString(),
    entity,
    metadata: { tagId },
    userId,
  });
}

export async function emitTagRemoved(
  entityType: 'contact' | 'company' | 'deal',
  entity: { _id: { toString(): string } },
  tagId: string,
  userId?: string
): Promise<void> {
  await crmEventBus.emit('tag.removed', {
    entityType,
    entityId: entity._id.toString(),
    entity,
    metadata: { tagId },
    userId,
  });
}

// Initialize handlers when this module is imported
initializeCrmEventHandlers();

// Marketing Email Emitters

export async function emitMarketingEmailSent(
  campaignId: string,
  contactId: string,
  email: string,
  messageId: string
): Promise<void> {
  await crmEventBus.emit('marketing_email.sent', {
    entityType: 'contact', // Associated with contact
    entityId: contactId,
    entity: { email }, // Minimal entity data
    metadata: { campaignId, messageId },
  });
}

export async function emitMarketingEmailOpened(
  campaignId: string,
  contactId: string,
  email: string
): Promise<void> {
  await crmEventBus.emit('marketing_email.opened', {
    entityType: 'contact',
    entityId: contactId,
    entity: { email },
    metadata: { campaignId },
  });
}

export async function emitMarketingEmailClicked(
  campaignId: string,
  contactId: string,
  email: string,
  url: string
): Promise<void> {
  await crmEventBus.emit('marketing_email.clicked', {
    entityType: 'contact',
    entityId: contactId,
    entity: { email },
    metadata: { campaignId, url },
  });
}

export async function emitMarketingEmailBounced(
  campaignId: string,
  contactId: string,
  email: string,
  type: string,
  reason?: string
): Promise<void> {
  await crmEventBus.emit('marketing_email.bounced', {
    entityType: 'contact',
    entityId: contactId,
    entity: { email },
    metadata: { campaignId, type, reason },
  });
}

export async function emitMarketingEmailUnsubscribed(
  campaignId: string,
  contactId: string,
  email: string
): Promise<void> {
  await crmEventBus.emit('marketing_email.unsubscribed', {
    entityType: 'contact',
    entityId: contactId,
    entity: { email },
    metadata: { campaignId },
  });
}
