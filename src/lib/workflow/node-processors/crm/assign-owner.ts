/**
 * Assign Owner Processor
 *
 * Supports three assignment strategies:
 *   - `specific`        — set ownerId to a provided user.
 *   - `round_robin`     — rotate across the org's active users (deterministic by entity id).
 *   - `load_balanced`   — assign to the user with the fewest active records of the same type.
 *
 * `round_robin` and `load_balanced` are best-effort: they fall through to
 * `specific` when no candidate users are configured on the node. The simpler
 * branches keep production safe even when org-wide user listing isn't wired in.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { contactRepository } from '../../../db/repository/crm/contact.repository';
import { dealRepository } from '../../../db/repository/crm/deal.repository';
import { resolveEntityId } from './crm-helpers';

type AssignmentType = 'specific' | 'round_robin' | 'load_balanced';

export class AssignOwnerProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;
    const entityType = String(config.entityType || 'contact');
    // `strategy` is the prompt's config key; `assignmentType` kept for back-compat.
    const entityId = resolveEntityId(config, execution, entityType);
    if (!entityId) throw new Error('Entity ID is required');

    const assignmentType = (String(config.strategy || config.assignmentType || 'specific') as AssignmentType);
    const candidateIds = Array.isArray(config.candidateUserIds)
      ? (config.candidateUserIds as unknown[]).map(String)
      : undefined;

    let ownerId: string | undefined;
    switch (assignmentType) {
      case 'specific':
        ownerId = (config.userId ? String(config.userId) : undefined) ?? (config.ownerId ? String(config.ownerId) : undefined);
        break;
      case 'round_robin':
        ownerId = pickRoundRobin(candidateIds, entityId);
        break;
      case 'load_balanced':
        // Assign to the candidate currently owning the fewest active records of
        // the same entity type (ties broken deterministically by round-robin).
        ownerId = await pickLoadBalanced(candidateIds, entityType, entityId);
        break;
    }

    if (!ownerId) {
      throw new Error(
        `assign_owner: no ownerId resolvable (assignmentType=${assignmentType}, candidates=${candidateIds?.length ?? 0})`
      );
    }

    const repository = entityType === 'contact' ? contactRepository : dealRepository;
    const updated = await repository.update(entityId, {
      ownerId,
    });

    if (!updated) throw new Error(`${entityType} not found: ${entityId}`);

    // Mirror the v2 routes: surface the update as a record-updated event.
    try {
      const crm = await import('@/lib/crm');
      const changes = { ownerId: { from: undefined, to: ownerId } };
      const userId = execution.userId?.toString();
      if (entityType === 'contact') await crm.emitContactUpdated(updated, changes, userId);
      else await crm.emitDealUpdated(updated, changes, userId);
    } catch (err) {
      console.error('[assign_owner] updated-event emit failed:', err instanceof Error ? err.message : err);
    }

    return {
      success: true,
      entityType,
      entityId,
      ownerId,
      assignmentType,
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const assignmentType = String(config.strategy || config.assignmentType || 'specific');
    if (!['specific', 'round_robin', 'load_balanced'].includes(assignmentType)) {
      errors.push('strategy must be specific, round_robin, or load_balanced');
    }
    if (assignmentType === 'specific' && !config.userId && !config.ownerId) {
      errors.push('userId is required for specific assignment');
    }
    if (assignmentType !== 'specific') {
      const candidates = config.candidateUserIds;
      if (!Array.isArray(candidates) || candidates.length === 0) {
        errors.push(`${assignmentType} assignment requires non-empty candidateUserIds`);
      }
    }
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}

/**
 * Deterministic round-robin: hash the entity id, modulo the candidate list.
 * Same entity always lands on the same candidate so retries don't bounce ownership.
 */
function pickRoundRobin(candidates: string[] | undefined, entityId: string): string | undefined {
  if (!candidates || candidates.length === 0) return undefined;
  let hash = 0;
  for (let i = 0; i < entityId.length; i++) {
    hash = (hash * 31 + entityId.charCodeAt(i)) >>> 0;
  }
  return candidates[hash % candidates.length];
}

/**
 * Load-balanced assignment: pick the candidate owning the fewest active records
 * of the same entity type within the org. Counts come from the repository
 * (`contact` → contacts owned; otherwise → open deals owned). Ties fall back to
 * the deterministic round-robin so retries stay stable. Best-effort: any count
 * failure degrades to round-robin.
 */
async function pickLoadBalanced(
  candidates: string[] | undefined,
  entityType: string,
  entityId: string
): Promise<string | undefined> {
  if (!candidates || candidates.length === 0) return undefined;
  try {
    const counts = await Promise.all(
      candidates.map(async (userId) => {
        if (entityType === 'contact') {
          const res = await contactRepository.find({ ownerId: userId }, { page: 1, limit: 1 });
          return { userId, count: res.pagination.total };
        }
        const res = await dealRepository.find(
          { ownerId: userId, status: 'open' },
          { page: 1, limit: 1 }
        );
        return { userId, count: res.pagination.total };
      })
    );
    // Lowest count wins; deterministic tie-break by round-robin among the minima.
    const min = Math.min(...counts.map((c) => c.count));
    const tied = counts.filter((c) => c.count === min).map((c) => c.userId);
    return pickRoundRobin(tied, entityId) ?? tied[0];
  } catch (err) {
    console.error('[assign_owner] load_balanced count failed, falling back to round_robin:', err instanceof Error ? err.message : err);
    return pickRoundRobin(candidates, entityId);
  }
}
