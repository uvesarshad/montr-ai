/**
 * Create Activity / Create Task / Log Note Processor
 *
 * Backs three registry subTypes:
 *   - `create_activity` — log a note/call/meeting/email/task on a record.
 *   - `create_task`      — sugar: defaults type=task, supports `dueInDays`,
 *                          `assignTo` (owner|specific|creator) and an explicit
 *                          `title`/`assigneeId`.
 *   - `log_note`         — thin alias: type=note, body on a target record.
 *
 * Target resolution: explicit `targetType`/`targetId` win; otherwise it falls
 * back to dealId → companyId → contactId from config, then to the typed
 * execution pointers, then to the triggering record. Config values are already
 * variable-interpolated by the engine.
 *
 * Fires `activity.created` on success (errors swallowed).
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { activityRepository } from '../../../db/repository/crm/activity.repository';
import { contactRepository } from '../../../db/repository/crm/contact.repository';
import { triggerRecordId } from './crm-helpers';

type TargetType = 'contact' | 'company' | 'deal';

export class CreateActivityProcessor implements NodeProcessor {
  /** Operating mode, set by the registry alias wrappers below. */
  constructor(private readonly mode: 'activity' | 'task' | 'note' = 'activity') {}

  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;
    const creatorId = execution.userId.toString();
    const str = (v: unknown, fallback = ''): string => (v == null ? fallback : String(v));
    const strOrUndef = (v: unknown): string | undefined => (v == null ? undefined : String(v));

    // Activity type: forced by mode for task/note, else config.activityType.
    const type =
      this.mode === 'task' ? 'task'
        : this.mode === 'note' ? 'note'
          : str(config.activityType, 'note');

    // Subject: create_task accepts `title`; everyone accepts `subject`.
    const subject = str(config.title) || str(config.subject) || (type === 'note' ? 'Note' : '');
    const body = str(config.body) || str(config.description);

    // Resolve target. Explicit targetType/targetId override per-entity ids.
    const { targetType, targetId, contactId, companyId, dealId } = await this.resolveTarget(
      config,
      execution
    );
    if (!targetId) throw new Error('Activity must be associated with a contact, company, or deal');

    if (this.mode !== 'note' && !subject) {
      throw new Error('Activity subject is required');
    }

    // Due date — create_task supports `dueInDays`; everyone supports `dueDate`.
    let dueDate: Date | undefined;
    if (config.dueInDays != null && String(config.dueInDays) !== '') {
      dueDate = new Date(Date.now() + Number(config.dueInDays) * 24 * 60 * 60 * 1000);
    } else if (config.dueDate) {
      dueDate = new Date(strOrUndef(config.dueDate)!);
    }

    // Assignee — owner | specific | creator (default: owner of target → creator).
    const assignedTo = await this.resolveAssignee(config, targetType, targetId, creatorId);

    const status = str(config.status, type === 'note' ? 'completed' : 'pending');

    const activity = await activityRepository.create({
      type: type as 'note' | 'task' | 'call' | 'meeting' | 'email',
      subject,
      body,
      completed: status === 'completed',
      targetType,
      targetId,
      contactId: contactId || undefined,
      dealId: dealId || undefined,
      companyId: companyId || undefined,
      assignedTo: assignedTo || undefined,
      dueDate,
      createdById: creatorId,
    });

    try {
      const { emitActivityCreated } = await import('@/lib/crm');
      await emitActivityCreated(activity, creatorId);
    } catch (err) {
      console.error('[create_activity] activity.created emit failed:', err instanceof Error ? err.message : err);
    }

    return {
      success: true,
      activityId: activity._id.toString(),
      activity: {
        type: activity.type,
        subject: activity.subject,
        status: activity.completed ? 'completed' : 'pending',
      },
    };
  }

  private async resolveTarget(
    config: Record<string, unknown>,
    execution: NodeProcessorContext['execution']
  ): Promise<{
    targetType: TargetType;
    targetId?: string;
    contactId?: string;
    companyId?: string;
    dealId?: string;
  }> {
    const strOrUndef = (v: unknown): string | undefined => (v == null ? undefined : String(v));

    // Explicit target wins.
    const explicitType = strOrUndef(config.targetType) as TargetType | undefined;
    const explicitId = strOrUndef(config.targetId);
    if (explicitType && explicitId) {
      return {
        targetType: explicitType,
        targetId: explicitId,
        contactId: explicitType === 'contact' ? explicitId : strOrUndef(config.contactId),
        companyId: explicitType === 'company' ? explicitId : strOrUndef(config.companyId),
        dealId: explicitType === 'deal' ? explicitId : strOrUndef(config.dealId),
      };
    }

    const contactId = strOrUndef(config.contactId) ?? execution.contactId?.toString();
    const dealId = strOrUndef(config.dealId) ?? execution.dealId?.toString();
    const companyId = strOrUndef(config.companyId);

    if (dealId) return { targetType: 'deal', targetId: dealId, contactId, companyId, dealId };
    if (companyId) return { targetType: 'company', targetId: companyId, contactId, companyId, dealId };
    if (contactId) return { targetType: 'contact', targetId: contactId, contactId, companyId, dealId };

    // Last resort: the triggering record (assume contact unless a targetType hint).
    const trigId = triggerRecordId(execution);
    if (trigId) {
      const t = explicitType ?? 'contact';
      return { targetType: t, targetId: trigId, contactId, companyId, dealId };
    }
    return { targetType: 'contact', targetId: undefined, contactId, companyId, dealId };
  }

  private async resolveAssignee(
    config: Record<string, unknown>,
    targetType: TargetType,
    targetId: string,
    creatorId: string
  ): Promise<string | undefined> {
    const assignTo = config.assignTo ? String(config.assignTo) : undefined;
    const explicit = config.assigneeId
      ? String(config.assigneeId)
      : config.assignedTo
        ? String(config.assignedTo)
        : undefined;

    if (assignTo === 'specific') return explicit;
    if (assignTo === 'creator') return creatorId;
    if (explicit && !assignTo) return explicit;

    // 'owner' (default): look up the target record's ownerId; fall back to creator.
    if (targetType === 'contact') {
      const contact = await contactRepository.findById(targetId);
      const owner = (contact as { ownerId?: { toString(): string } } | null)?.ownerId;
      return owner ? owner.toString() : creatorId;
    }
    return creatorId;
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (this.mode === 'activity' && !config.subject && !config.title) {
      errors.push('Subject is required');
    }
    const validTypes = ['note', 'task', 'call', 'meeting', 'email'];
    if (config.activityType && !validTypes.includes(String(config.activityType))) {
      errors.push(`Activity type must be one of: ${validTypes.join(', ')}`);
    }
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}
