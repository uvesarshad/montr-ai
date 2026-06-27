/**
 * Parse + validate a `filterTree` query param (JSON) from a list route and
 * convert it to a sanitized Mongo fragment, ready to be AND-ed into a
 * repository query alongside the mandatory org scope.
 *
 * Returns `undefined` when the param is absent, malformed, or contributes no
 * constraints — callers should treat that as "no extra filter".
 */
import { filterTreeSchema } from '@/validations/crm/view.schema';
import {
  filterTreeToMongo,
  type CrmEntityType,
} from '@/lib/crm/filter-query';

export function parseFilterTreeParam(
  raw: string | null | undefined,
  entityType: CrmEntityType,
): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const result = filterTreeSchema.safeParse(parsed);
  if (!result.success) return undefined;
  const mongo = filterTreeToMongo(result.data, entityType);
  return mongo ?? undefined;
}
