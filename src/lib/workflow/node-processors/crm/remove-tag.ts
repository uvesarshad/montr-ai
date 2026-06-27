/**
 * Remove Tag Processor
 *
 * Removes a tag from a CRM record (contact | company | deal). The tag may be
 * given as `tagId` or `tagName` (resolved within the org; never created here).
 * `recordId` defaults to the triggering record when omitted.
 *
 * Fires the `tag.removed` CRM event on success (errors swallowed).
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { contactRepository } from '../../../db/repository/crm/contact.repository';
import { companyRepository } from '../../../db/repository/crm/company.repository';
import { dealRepository } from '../../../db/repository/crm/deal.repository';
import { resolveEntityId, resolveTagId, emitTagEvent } from './crm-helpers';

type EntityType = 'contact' | 'company' | 'deal';

function repoFor(entityType: EntityType) {
  return entityType === 'contact'
    ? contactRepository
    : entityType === 'company'
      ? companyRepository
      : dealRepository;
}

export class RemoveTagProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;
    const userId = execution.userId?.toString();

    const entityType = String(config.entityType || 'contact') as EntityType;
    const entityId = resolveEntityId(config, execution, entityType);
    if (!entityId) throw new Error('Entity ID is required');

    const tagId = await resolveTagId(config, userId, entityType, false);
    if (!tagId) throw new Error('Tag ID or Tag Name is required');

    const repository = repoFor(entityType);
    const entity = await repository.findById(entityId);
    if (!entity) throw new Error(`${entityType} not found: ${entityId}`);

    const tags = ((entity as { tags?: Array<{ toString(): string }> }).tags || []);
    const before = tags.length;
    const remaining = tags.filter(t => t.toString() !== tagId);
    const removed = remaining.length !== before;

    if (removed) {
      await repository.update(entityId, {
        tags: remaining.map(t => t.toString()),
      });
      await emitTagEvent('removed', entityType, entityId, tagId, userId);
    }

    return { success: true, entityType, entityId, tagId, removed };
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
