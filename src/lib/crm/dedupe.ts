import { Types, type Model, type PipelineStage } from 'mongoose';
import { connectMongoose } from '@/lib/mongodb';
import CrmDedupeRule, { type IDedupeCriterion } from '@/lib/db/models/crm/dedupe-rule.model';
import CrmContact from '@/lib/db/models/crm/contact.model';
import CrmCompany from '@/lib/db/models/crm/company.model';
import CrmDeal from '@/lib/db/models/crm/deal.model';

export type DedupeEntityType = 'contact' | 'company' | 'deal';

/** Default criteria when no rule document exists for an org+entityType. */
export const DEFAULT_CRITERIA: Record<DedupeEntityType, IDedupeCriterion[]> = {
  contact: [{ fields: ['email'] }, { fields: ['phoneNormalized'] }],
  company: [{ fields: ['domain'] }, { fields: ['name'] }],
  deal: [], // off by default — too many false positives on deal names
};

/** Case-insensitive (lowercase-compared) fields per entity. */
const NAME_FIELDS: Record<DedupeEntityType, string[]> = {
  contact: ['firstName', 'lastName'],
  company: ['name'],
  deal: ['name'],
};

function modelFor(entityType: DedupeEntityType): Model<unknown> {
  switch (entityType) {
    case 'contact':
      return CrmContact as unknown as Model<unknown>;
    case 'company':
      return CrmCompany as unknown as Model<unknown>;
    case 'deal':
      return CrmDeal as unknown as Model<unknown>;
  }
}

/**
 * Effective dedupe rules for an org+entityType. Returns the stored document's
 * criteria when present, otherwise the built-in defaults. `isDefault` lets the
 * API surface tell the UI whether the org has customized the rules.
 */
export async function getDedupeRules(
  entityType: DedupeEntityType
): Promise<{ criteria: IDedupeCriterion[]; isActive: boolean; isDefault: boolean }> {
  await connectMongoose();
  const doc = await CrmDedupeRule.findOne({ entityType }).lean().exec();
  if (!doc) {
    return { criteria: DEFAULT_CRITERIA[entityType], isActive: true, isDefault: true };
  }
  return {
    criteria: (doc.criteria || []).map((c) => ({ fields: c.fields })),
    isActive: doc.isActive,
    isDefault: false,
  };
}

/** Build a Mongo equality clause for a single field given a candidate value. */
function fieldClause(
  entityType: DedupeEntityType,
  field: string,
  candidate: Record<string, unknown>
): Record<string, unknown> | null {
  const raw = candidate[field];

  // Contact email — match scalar primary OR any multi-value entry.
  if (entityType === 'contact' && field === 'email') {
    const value = readEmail(candidate);
    if (!value) return null;
    return { $or: [{ email: value }, { 'emails.value': value }] };
  }

  // Contact phone — match normalized scalar OR any multi-value normalized.
  if (entityType === 'contact' && (field === 'phoneNormalized' || field === 'phone')) {
    const normalized = readPhoneNormalized(candidate);
    if (!normalized) return null;
    return { $or: [{ phoneNormalized: normalized }, { 'phones.normalized': normalized }] };
  }

  // Company domain — lowercased exact.
  if (entityType === 'company' && field === 'domain') {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    return { domain: raw.trim().toLowerCase() };
  }

  // Name-ish fields — case-insensitive exact via anchored regex.
  if (NAME_FIELDS[entityType].includes(field)) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    return { [field]: { $regex: `^${escapeRegex(raw.trim())}$`, $options: 'i' } };
  }

  // Generic equality (companyId, custom scalar fields, etc.).
  if (raw === undefined || raw === null || raw === '') return null;
  return { [field]: raw };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Resolve the candidate's primary email from scalar or emails[] array. */
function readEmail(candidate: Record<string, unknown>): string | null {
  const scalar = candidate.email;
  if (typeof scalar === 'string' && scalar.trim()) return scalar.trim().toLowerCase();
  const emails = candidate.emails as Array<{ value?: string; primary?: boolean }> | undefined;
  if (Array.isArray(emails) && emails.length) {
    const primary = emails.find((e) => e.primary) ?? emails[0];
    if (primary?.value) return primary.value.trim().toLowerCase();
  }
  return null;
}

/** Resolve a digits-only phone from scalar mirror or phones[] array. */
function readPhoneNormalized(candidate: Record<string, unknown>): string | null {
  const scalarNorm = candidate.phoneNormalized;
  if (typeof scalarNorm === 'string' && scalarNorm.length >= 7) return scalarNorm;
  const scalar = candidate.phone;
  if (typeof scalar === 'string') {
    const digits = scalar.replace(/\D/g, '');
    if (digits.length >= 7) return digits;
  }
  const phones = candidate.phones as
    | Array<{ value?: string; normalized?: string; primary?: boolean }>
    | undefined;
  if (Array.isArray(phones) && phones.length) {
    const primary = phones.find((p) => p.primary) ?? phones[0];
    const n = primary?.normalized || (primary?.value || '').replace(/\D/g, '');
    if (n && n.length >= 7) return n;
  }
  return null;
}

export interface DuplicateMatch {
  criterion: IDedupeCriterion;
  records: Array<Record<string, unknown>>;
}

const CANDIDATE_PROJECTION = {
  contact: { firstName: 1, lastName: 1, email: 1, phone: 1, companyId: 1, createdAt: 1 },
  company: { name: 1, domain: 1, website: 1, createdAt: 1 },
  deal: { name: 1, value: 1, pipelineId: 1, createdAt: 1 },
} as const;

/**
 * Find existing records that look like duplicates of `candidate`.
 *
 * For each active criterion, build a query AND-ing every field's equality clause
 * (contact email/phone special-cased to scalar+multi-value `$or`), excluding
 * soft-deleted rows and (when updating) the candidate's own `_id`. Returns up to
 * 5 matches per criterion alongside the criterion that matched.
 */
export async function findDuplicatesForCandidate(
  entityType: DedupeEntityType,
  candidate: Record<string, unknown>,
  excludeId?: string
): Promise<DuplicateMatch[]> {
  await connectMongoose();
  const { criteria, isActive } = await getDedupeRules(entityType);
  if (!isActive || !criteria.length) return [];

  const Model = modelFor(entityType);
  const results: DuplicateMatch[] = [];

  for (const criterion of criteria) {
    if (!criterion.fields.length) continue;

    const clauses: Record<string, unknown>[] = [];
    let skip = false;
    for (const field of criterion.fields) {
      const clause = fieldClause(entityType, field, candidate);
      if (!clause) {
        // Candidate has no value for an AND'd field → criterion can't match.
        skip = true;
        break;
      }
      clauses.push(clause);
    }
    if (skip) continue;

    const query: Record<string, unknown> = {
      deletedAt: null,
      $and: clauses,
    };
    if (excludeId && Types.ObjectId.isValid(excludeId)) {
      query._id = { $ne: new Types.ObjectId(excludeId) };
    }

    const matches = await Model.find(query)
      .select(CANDIDATE_PROJECTION[entityType])
      .limit(5)
      .lean()
      .exec();

    if (matches.length) {
      results.push({ criterion, records: matches as Array<Record<string, unknown>> });
    }
  }

  return results;
}

export interface DuplicateCluster {
  key: Record<string, unknown>;
  criterion: IDedupeCriterion;
  records: Array<Record<string, unknown>>;
}

/**
 * Scan the whole collection for duplicate clusters: for each active criterion,
 * group non-deleted records by that criterion's field tuple and keep groups with
 * count > 1. Capped at 50 clusters/page. Name fields are lowercased in the group
 * key so case-variant duplicates collapse together.
 */
export async function scanDuplicates(
  entityType: DedupeEntityType,
  options: { page?: number; limit?: number } = {}
): Promise<{ clusters: DuplicateCluster[]; page: number; limit: number; hasMore: boolean }> {
  await connectMongoose();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(options.limit || 50, 50);
  const { criteria, isActive } = await getDedupeRules(entityType);

  if (!isActive || !criteria.length) {
    return { clusters: [], page, limit, hasMore: false };
  }

  const Model = modelFor(entityType);
  const orgMatch = { deletedAt: null };
  const proj = CANDIDATE_PROJECTION[entityType];

  // Gather candidate clusters across all criteria, then paginate the flattened
  // list. We over-fetch per criterion then slice for the requested page.
  const all: DuplicateCluster[] = [];

  for (const criterion of criteria) {
    if (!criterion.fields.length) continue;

    // Build the _id group key for each field. Email/phone use the contact's
    // scalar mirror (multi-value array clustering is intentionally out of scope
    // for the scan — the per-candidate check covers array hits at create time).
    const groupId: Record<string, unknown> = {};
    for (const field of criterion.fields) {
      if (entityType === 'contact' && field === 'email') {
        groupId.email = { $toLower: '$email' };
      } else if (entityType === 'contact' && (field === 'phoneNormalized' || field === 'phone')) {
        groupId.phoneNormalized = '$phoneNormalized';
      } else if (entityType === 'company' && field === 'domain') {
        groupId.domain = { $toLower: '$domain' };
      } else if (NAME_FIELDS[entityType].includes(field)) {
        groupId[field] = { $toLower: `$${field}` };
      } else {
        groupId[field] = `$${field}`;
      }
    }

    // Exclude groups where any key component is null/empty.
    const notNullExpr: Record<string, unknown>[] = Object.keys(groupId).map((k) => ({
      [`_id.${k}`]: { $nin: [null, ''] },
    }));

    const pipeline = [
      { $match: orgMatch },
      { $group: { _id: groupId, ids: { $push: '$_id' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 }, $and: notNullExpr } },
      { $limit: limit + (page - 1) * limit + 1 },
    ] as unknown as PipelineStage[];

    const groups = await Model.aggregate(pipeline).exec();

    for (const g of groups) {
      const records = await Model.find({ _id: { $in: g.ids } })
        .select(proj)
        .limit(10)
        .lean()
        .exec();
      all.push({
        key: g._id as Record<string, unknown>,
        criterion,
        records: records as Array<Record<string, unknown>>,
      });
    }
  }

  const start = (page - 1) * limit;
  const clusters = all.slice(start, start + limit);
  const hasMore = all.length > start + limit;

  return { clusters, page, limit, hasMore };
}
