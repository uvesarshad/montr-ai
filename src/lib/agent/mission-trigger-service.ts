/**
 * Event-triggered mission service (B1-6.2; extended Phase 2 2026-06-05).
 *
 * Subscribes to BOTH event systems and fires missions from configured
 * MissionTrigger records when matching events occur:
 *   - CRM event bus (in-process): contact/deal/email lifecycle
 *   - Domain event bus (Redis pub/sub): inbound-channel events from every
 *     channel — forms, WhatsApp, omnichannel inbox, chatbot escalations,
 *     ad-lead captures, meetings, completed calls
 *
 * Registration: registerMissionTriggerSubscriber() must run once per process
 * — wired into server.js (next to the notification dispatcher) and the
 * workflow worker startup.
 */

import { connectMongoose } from '@/lib/mongodb';
import MissionTrigger, { MissionTriggerEventType } from '@/lib/db/models/mission-trigger.model';
import { agentMissionRepository } from '@/lib/db/repository/agent-mission.repository';
import { getMissionTemplateById } from '@/lib/agent/mission-templates';
import { crmEventBus, type CrmEventType, type CrmEventData } from '@/lib/crm/events';
import { subscribeDomainEvent, type DomainEventEnvelope, type DomainEventType } from '@/lib/events/domain-bus';

let subscribed = false;

/** Domain-bus events bridged into mission triggers (Phase 2). */
const DOMAIN_TRIGGER_EVENTS: Array<{ domain: DomainEventType; trigger: MissionTriggerEventType }> = [
  { domain: 'form.submitted', trigger: 'form.submitted' },
  { domain: 'whatsapp.message_received', trigger: 'whatsapp.message_received' },
  { domain: 'message.received', trigger: 'message.received' },
  { domain: 'ai_bot.escalation_requested', trigger: 'ai_bot.escalation_requested' },
  { domain: 'ads.lead_captured', trigger: 'ads.lead_captured' },
  { domain: 'meeting.booked', trigger: 'meeting.booked' },
  { domain: 'voice.call_completed', trigger: 'voice.call_completed' },
];

/**
 * Register the mission trigger listeners. Safe to call multiple times —
 * subscribes only once per process.
 */
export function registerMissionTriggerSubscriber(): void {
  if (subscribed) return;
  subscribed = true;

  // Map CRM event types to MissionTrigger event types.
  const mappedTypes: Array<{ crm: CrmEventType; trigger: MissionTriggerEventType }> = [
    { crm: 'contact.created', trigger: 'contact.created' },
    { crm: 'deal.won', trigger: 'deal.won' },
    { crm: 'deal.lost', trigger: 'deal.lost' },
    { crm: 'deal.stage_changed', trigger: 'deal.stage_changed' },
    { crm: 'email.received', trigger: 'email.received' },
  ];

  for (const { crm, trigger } of mappedTypes) {
    crmEventBus.on(crm, async (_eventType: CrmEventType, data: CrmEventData) => {
      await fireMissionTriggers(trigger, data.entityId, data.metadata);
    });
  }

  // Phase 2: domain-bus subscriptions (inbound channels). The envelope's
  // brandId scopes trigger matching when present.
  for (const { domain, trigger } of DOMAIN_TRIGGER_EVENTS) {
    subscribeDomainEvent(domain, async (env: DomainEventEnvelope) => {
      const payload = (env.payload ?? {}) as Record<string, unknown>;
      const entityId = String(
        payload.contactId ?? payload.conversationId ?? payload.leadId ?? payload.eventId ?? payload.submissionId ?? '',
      );
      await fireMissionTriggers(trigger, entityId, {
        ...payload,
        brandId: env.brandId,
      });
    });
  }

  console.log('[MissionTrigger] Subscribers registered (CRM bus + domain bus)');
}

/**
 * Fire mission triggers for a given event type.
 * Called by the event-bus subscribers and directly from submission handlers.
 */
export async function fireMissionTriggers(
  eventType: MissionTriggerEventType,
  entityId: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await connectMongoose();

    const triggers = await MissionTrigger.find({
      eventType,
      enabled: true,
    }).lean();

    const eventBrandId = metadata?.brandId ? String(metadata.brandId) : null;

    for (const trigger of triggers) {
      try {
        // Brand scoping: when the event carries a brandId, only triggers on
        // that brand fire (org-wide events fire every brand's triggers).
        if (eventBrandId && trigger.brandId && trigger.brandId !== eventBrandId) continue;

        // Evaluate optional conditions.
        if (trigger.conditions) {
          const cond = JSON.parse(trigger.conditions) as Record<string, unknown>;
          const passes = Object.entries(cond).every(
            ([k, v]) => (metadata ?? {})[k] === v,
          );
          if (!passes) continue;
        }

        const template = getMissionTemplateById(trigger.templateId);
        const title = template?.title ?? `Mission triggered by ${eventType}`;

        // Context-rich summary so the agent knows WHAT fired the mission
        // (entity + channel ownership flags travel in the summary text).
        const contextBits: string[] = [`Triggered by ${eventType}`];
        if (entityId) contextBits.push(`entity ${entityId}`);
        if (metadata?.contactId) contextBits.push(`contact ${String(metadata.contactId)}`);
        if (metadata?.conversationId) contextBits.push(`conversation ${String(metadata.conversationId)}`);
        if (metadata?.humanAssigned) contextBits.push('NOTE: a human owns this conversation — do not reply directly, coordinate with them');
        else if (metadata?.botHandled) contextBits.push('NOTE: an AI bot handles this conversation — do not double-reply; act on follow-ups outside the thread');
        const summary = `${template?.summary ?? 'Event-triggered mission.'} [${contextBits.join(' · ')}]`;

        const mode = trigger.missionMode ?? 'mixed';

        const mission = await agentMissionRepository.create({
          brandId: trigger.brandId,
          userId: trigger.userId,
          title,
          summary,
          templateId: trigger.templateId,
          status: 'active',
          mode,
        });

        // Autonomous triggered missions start working immediately.
        if (mode === 'autonomous') {
          const { dispatchMissionContinuation } = await import('@/lib/queue/queue');
          await dispatchMissionContinuation({
            missionId: mission._id.toString(),
            userId: trigger.userId,
            brandId: trigger.brandId,
            continuationPrompt: template?.starterPrompt
              ? `${template.starterPrompt}\n\nContext: ${contextBits.join(' · ')}`
              : undefined,
            iteration: 0,
          }, 1000);
        }

        await MissionTrigger.findByIdAndUpdate(trigger._id, {
          $inc: { triggerCount: 1 },
          lastTriggeredAt: new Date(),
        });
      } catch (err) {
        console.error(`[MissionTrigger] Failed to spawn mission for trigger ${trigger._id}:`, err);
      }
    }
  } catch (err) {
    console.error('[MissionTrigger] fireMissionTriggers error:', err);
  }
}
