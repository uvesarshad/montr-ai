/**
 * Shared helpers for CRM node processors.
 *
 * Centralizes:
 *  - resolving the target record id, defaulting to the triggering record
 *    (`execution.triggerData.record._id`) when the node didn't specify one;
 *  - resolving a tag by name within the org (optionally creating it for
 *    add_tag, matching the legacy CRM engine's tag-by-id-only behaviour but
 *    extended with name lookup the legacy engine lacked).
 */

import type { NodeProcessorContext } from '../index';
import { tagRepository } from '../../../db/repository/crm/tag.repository';

type Execution = NodeProcessorContext['execution'];

/** The triggering record's id, if a CRM-record trigger started this run. */
export function triggerRecordId(execution: Execution): string | undefined {
  const td = execution.triggerData as { record?: { _id?: unknown; id?: unknown } } | undefined;
  const raw = td?.record?._id ?? td?.record?.id;
  return raw != null ? String(raw) : undefined;
}

/**
 * Resolve the entity id for an action, in priority order:
 *   1. explicit config.recordId / config.entityId
 *   2. the typed execution pointer (contactId / dealId)
 *   3. the triggering record id
 */
export function resolveEntityId(
  config: Record<string, unknown>,
  execution: Execution,
  entityType: string
): string | undefined {
  const explicit =
    (config.recordId ? String(config.recordId) : undefined) ??
    (config.entityId ? String(config.entityId) : undefined);
  if (explicit) return explicit;

  const typed =
    entityType === 'contact'
      ? execution.contactId?.toString()
      : entityType === 'deal'
        ? execution.dealId?.toString()
        : undefined;
  if (typed) return typed;

  return triggerRecordId(execution);
}

/**
 * Resolve a tag id from config. Accepts an explicit `tagId`, or a `tagName`
 * resolved within the org. When `createIfMissing` is true (add_tag), a missing
 * named tag is created. Returns the resolved tag id, or undefined when nothing
 * could be resolved.
 */
export async function resolveTagId(
  config: Record<string, unknown>,
  createdById: string,
  entityType: 'contact' | 'company' | 'deal',
  createIfMissing: boolean
): Promise<string | undefined> {
  if (config.tagId) return String(config.tagId);

  const tagName = config.tagName ? String(config.tagName).trim() : undefined;
  if (!tagName) return undefined;

  const existing = await tagRepository.findByName(tagName);
  if (existing) return existing._id.toString();

  if (!createIfMissing) return undefined;

  const created = await tagRepository.create({
    name: tagName,
    type: entityType,
    createdById,
  });
  return created._id.toString();
}

/** Emit a tag.added / tag.removed CRM event; errors swallowed. */
export async function emitTagEvent(
  kind: 'added' | 'removed',
  entityType: 'contact' | 'company' | 'deal',
  entityId: string,
  tagId: string,
  userId?: string
): Promise<void> {
  try {
    const crm = await import('@/lib/crm');
    const stub = { _id: { toString: () => entityId } };
    if (kind === 'added') await crm.emitTagAdded(entityType, stub, tagId, userId);
    else await crm.emitTagRemoved(entityType, stub, tagId, userId);
  } catch (err) {
    console.error(`[crm] tag.${kind} emit failed:`, err instanceof Error ? err.message : err);
  }
}
