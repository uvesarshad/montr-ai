/**
 * Delete Record Processor
 *
 * Soft-deletes a CRM record (contact | company | deal) via its repository —
 * the record is moved to trash (deletedAt set), not removed. A 30-day purge
 * cron hard-deletes trashed records later.
 * When `config.recordId` is empty, falls back to the triggering record
 * (`execution.triggerData.record._id`) so a record-triggered workflow can act
 * on the record that started it without re-specifying its id.
 *
 * After a successful delete, fires the matching CRM `*.deleted` event so
 * downstream workflows / webhooks observe the deletion (errors swallowed —
 * an emit failure must never fail the delete that already happened).
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { contactRepository } from '../../../db/repository/crm/contact.repository';
import { companyRepository } from '../../../db/repository/crm/company.repository';
import { dealRepository } from '../../../db/repository/crm/deal.repository';

type EntityType = 'contact' | 'company' | 'deal';

function triggerRecordId(execution: NodeProcessorContext['execution']): string | undefined {
  const td = execution.triggerData as { record?: { _id?: unknown; id?: unknown } } | undefined;
  const raw = td?.record?._id ?? td?.record?.id;
  return raw != null ? String(raw) : undefined;
}

export class DeleteRecordProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    const entityType = String(config.entityType || 'contact') as EntityType;
    const recordId =
      (config.recordId ? String(config.recordId) : undefined) ?? triggerRecordId(execution);
    if (!recordId) throw new Error('recordId is required (and no triggering record was available)');

    const userId = execution.userId?.toString();
    let deleted = false;
    switch (entityType) {
      case 'contact':
        deleted = await contactRepository.softDelete(recordId, userId);
        break;
      case 'company':
        deleted = await companyRepository.softDelete(recordId, userId);
        break;
      case 'deal':
        deleted = await dealRepository.softDelete(recordId, userId);
        break;
      default:
        throw new Error(`Unsupported entityType: ${entityType}`);
    }

    if (deleted) {
      await this.emitDeleted(entityType, recordId, execution.userId?.toString());
    }

    return { success: true, deleted, entityType, recordId };
  }

  private async emitDeleted(
    entityType: EntityType,
    recordId: string,
    userId?: string
  ): Promise<void> {
    try {
      const crm = await import('@/lib/crm');
      const stub = { _id: { toString: () => recordId } };
      if (entityType === 'contact') await crm.emitContactDeleted(stub, userId);
      else if (entityType === 'company') await crm.emitCompanyDeleted(stub, userId);
      else await crm.emitDealDeleted(stub, userId);
    } catch (err) {
      console.error('[delete_record] deleted-event emit failed:', err instanceof Error ? err.message : err);
    }
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.entityType || !['contact', 'company', 'deal'].includes(String(config.entityType))) {
      errors.push('entityType must be contact, company, or deal');
    }
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}
