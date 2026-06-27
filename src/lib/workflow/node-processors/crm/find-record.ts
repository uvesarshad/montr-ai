/**
 * Find Record Processor
 *
 * Looks up a single CRM record (contact | company | deal) by a match field.
 * Config values are already variable-interpolated by the execution engine
 * before they reach the processor, so `matchValue` may originate from a
 * `{{...}}` expression upstream.
 *
 * Output: `{ found, record }` so downstream branch nodes can route on `found`.
 *
 * Contact phone lookups use the model's `phoneNormalized` (digits-only)
 * field when `matchField` is `phone`, matching how the model normalizes on save.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { contactRepository } from '../../../db/repository/crm/contact.repository';
import { companyRepository } from '../../../db/repository/crm/company.repository';
import { dealRepository } from '../../../db/repository/crm/deal.repository';

type EntityType = 'contact' | 'company' | 'deal';

export class FindRecordProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    const entityType = String(config.entityType || 'contact') as EntityType;
    const matchField = config.matchField ? String(config.matchField) : undefined;
    const matchValue = config.matchValue != null ? String(config.matchValue) : undefined;
    if (!matchField) throw new Error('matchField is required');
    if (!matchValue) throw new Error('matchValue is required');

    let record: unknown = null;

    if (entityType === 'contact') {
      if (matchField === 'email') {
        record = await contactRepository.findByEmail(matchValue);
      } else if (matchField === 'phone') {
        // Matches the primary scalar OR any multi-value phone (digits-only).
        record = await contactRepository.findByPhone(matchValue);
      } else {
        record = await contactRepository.findOne({ [matchField]: matchValue });
      }
    } else if (entityType === 'company') {
      if (matchField === 'domain') {
        record = await companyRepository.findByDomain(matchValue);
      } else if (matchField === 'name') {
        record = await companyRepository.findByName(matchValue);
      } else {
        record = await companyRepository.findOne({ [matchField]: matchValue });
      }
    } else if (entityType === 'deal') {
      const results = await dealRepository.findAll({ [matchField]: matchValue });
      record = results[0] ?? null;
    } else {
      throw new Error(`Unsupported entityType: ${entityType}`);
    }

    const found = !!record;
    const recordId = found
      ? (record as { _id?: { toString(): string } })._id?.toString()
      : undefined;

    if (found && recordId) {
      await execution.updateVariable('found_record_id', recordId);
    }

    return {
      success: true,
      found,
      entityType,
      recordId,
      record: found ? record : null,
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.entityType || !['contact', 'company', 'deal'].includes(String(config.entityType))) {
      errors.push('entityType must be contact, company, or deal');
    }
    if (!config.matchField) errors.push('matchField is required');
    if (config.matchValue == null || config.matchValue === '') errors.push('matchValue is required');
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}
