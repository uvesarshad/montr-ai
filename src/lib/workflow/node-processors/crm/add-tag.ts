/**
 * Add Tag Processor
 *
 * Tags a CRM record (contact | company | deal). The tag may be given as
 * `tagId`, or as `tagName` (resolved within the org, created if missing).
 * `recordId` defaults to the triggering record when omitted.
 *
 * Fires the `tag.added` CRM event on success (errors swallowed).
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { contactRepository } from '../../../db/repository/crm/contact.repository';
import { companyRepository } from '../../../db/repository/crm/company.repository';
import { dealRepository } from '../../../db/repository/crm/deal.repository';
import { Types } from 'mongoose';
import { resolveEntityId, resolveTagId, emitTagEvent } from './crm-helpers';

type EntityType = 'contact' | 'company' | 'deal';

function repoFor(entityType: EntityType) {
  return entityType === 'contact'
    ? contactRepository
    : entityType === 'company'
      ? companyRepository
      : dealRepository;
}

export class AddTagProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;
    const userId = execution.userId?.toString();

    const entityType = String(config.entityType || 'contact') as EntityType;
    const entityId = resolveEntityId(config, execution, entityType);
    if (!entityId) throw new Error('Entity ID is required');

    const tagId = await resolveTagId(config, userId, entityType, true);
    if (!tagId) throw new Error('Tag ID or Tag Name is required');

    const repository = repoFor(entityType);
    const entity = await repository.findById(entityId);
    if (!entity) throw new Error(`${entityType} not found: ${entityId}`);

    const tags = ((entity as { tags?: Array<{ toString(): string }> }).tags || []);
    const already = tags.some(t => t.toString() === tagId);

    if (!already) {
      tags.push(new Types.ObjectId(tagId));
      await repository.update(entityId, {
        tags: tags.map(t => t.toString()),
      });
      await emitTagEvent('added', entityType, entityId, tagId, userId);
    }

    return { success: true, entityType, entityId, tagId, added: !already };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.entityType || !['contact', 'company', 'deal'].includes(String(config.entityType))) {
      errors.push('Entity type must be contact, company, or deal');
    }
    if (!config.tagId && !config.tagName) {
      errors.push('Tag ID or Tag Name is required');
    }
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}
