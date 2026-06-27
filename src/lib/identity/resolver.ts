/**
 * Identity resolver (X2) — the canonical "who is this person?" lookup.
 *
 * Every channel-aware producer (WhatsApp inbox, form submission, voice call,
 * social DM, email sync) routes its identifier through `resolveContact` before
 * writing to its own model. That guarantees a single `crm_contact` per person
 * per organization, no matter which channel touched first.
 *
 * Forward compatibility:
 * - `brandId` is part of the signature today even though `crm_contact` does
 *   not carry it yet. Once B3-4.6.1 adds brandId to the contact model, the
 *   query inside resolveContact will start filtering on it — no caller change
 *   needed.
 */

import mongoose, { Types } from 'mongoose';
import CrmContact, { ICrmContact, IContactChannel } from '@/lib/db/models/crm/contact.model';
import CrmAuditLog from '@/lib/db/models/crm/audit-log.model';
import { publishDomainEvent } from '@/lib/events/domain-bus';
import {
  normalizeEmail,
  normalizeHandle,
  normalizePhoneForMatch,
  SocialPlatform,
} from './normalize';

export type ContactChannelType = IContactChannel['type'];

export type IdentityMatchedBy =
  | 'email'
  | 'phoneNormalized'
  | 'phoneLegacy'
  | 'channel'
  | 'created'
  | null;

export interface ResolveContactInput {
  /** Forward-compatible. Stored on the contact once brandId lands (B3-4.6.1). */
  brandId?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Social handle keyed by platform. Each entry is a single identifier. */
  socialHandles?: Partial<Record<SocialPlatform, string>>;
  /** When true, create a new contact if no match is found. */
  createIfMissing?: boolean;
  /** Used for the `createdById` audit field when creating. Required if createIfMissing. */
  createdById?: string;
  /** Source attribution for new contacts. Default: 'api'. */
  source?: ICrmContact['source'];
  /** Default fields applied only when creating. */
  defaults?: {
    firstName?: string;
    lastName?: string;
    sourceDetails?: ICrmContact['sourceDetails'];
  };
}

export interface ResolveContactResult {
  contact: ICrmContact | null;
  created: boolean;
  matchedBy: IdentityMatchedBy;
}

async function ensureConnection(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();
  }
}

function buildChannelsFromInput(input: ResolveContactInput): IContactChannel[] {
  const channels: IContactChannel[] = [];
  const normEmail = normalizeEmail(input.email);
  const normPhone = normalizePhoneForMatch(input.phone);

  if (normEmail) {
    channels.push({ type: 'email', identifier: normEmail, isPrimary: true, verified: false });
  }
  if (normPhone) {
    channels.push({ type: 'phone', identifier: normPhone, isPrimary: !normEmail, verified: false });
  }

  if (input.socialHandles) {
    for (const [platform, raw] of Object.entries(input.socialHandles) as [SocialPlatform, string][]) {
      const normalized = normalizeHandle(platform, raw);
      if (!normalized) continue;
      // Contact model's IContactChannel allows email/phone/whatsapp/instagram/facebook/twitter/linkedin.
      // Telegram is not in that union yet (will be added in B3-4.5 channel work). Skip silently for now.
      if (platform === 'telegram') continue;
      channels.push({ type: platform as ContactChannelType, identifier: normalized, isPrimary: false, verified: false });
    }
  }

  return channels;
}

/**
 * Find (or optionally create) the CRM contact that corresponds to a given
 * identifier set.
 *
 * Resolution order (first match wins):
 *  1. Email exact (lowercase)
 *  2. Phone digits-only (phoneNormalized)
 *  3. Phone legacy field (handles contacts created before phoneNormalized backfilled)
 *  4. Channels[].identifier per platform (whatsapp number, instagram handle, etc.)
 *
 * The first writer's data wins on create; subsequent resolutions return the
 * existing contact without overwriting fields.
 */
export async function resolveContact(input: ResolveContactInput): Promise<ResolveContactResult> {
  await ensureConnection();
  const normEmail = normalizeEmail(input.email);
  const normPhone = normalizePhoneForMatch(input.phone);

  // Brand-scoped queries (B3-4.6.2). When brandId is provided, lookups and
  // creates are siloed to that brand — a person known to brand A is NOT the
  // same record as the same person under brand B. When brandId is not
  // provided, lookups span the whole org (back-compat for callers pre-dating
  // the brand picker).
  const brandIdObj = input.brandId ? new Types.ObjectId(input.brandId) : null;
  const brandScope = brandIdObj ? { brandId: brandIdObj } : {};

  // 1. Email
  if (normEmail) {
    const byEmail = await CrmContact.findOne({
      ...brandScope,
      $or: [{ email: normEmail }, { 'emails.value': normEmail }],
    }).exec();
    if (byEmail) return { contact: byEmail, created: false, matchedBy: 'email' };
  }

  // 2. Phone normalized
  if (normPhone) {
    const byPhone = await CrmContact.findOne({
      ...brandScope,
      $or: [{ phoneNormalized: normPhone }, { 'phones.normalized': normPhone }],
    }).exec();
    if (byPhone) return { contact: byPhone, created: false, matchedBy: 'phoneNormalized' };

    // 3. Phone legacy — old contacts may not have phoneNormalized set yet.
    // Use a digits-stripping regex against the raw `phone` field to catch them
    // even if stored as "(415) 555-1234".
    const legacyRegex = new RegExp(normPhone.split('').join('\\D*'));
    const byPhoneLegacy = await CrmContact.findOne({
      ...brandScope,
      phone: { $regex: legacyRegex },
    }).exec();
    if (byPhoneLegacy) {
      // Opportunistic backfill: set phoneNormalized so the next lookup is index-fast.
      if (!byPhoneLegacy.phoneNormalized) {
        byPhoneLegacy.phoneNormalized = normPhone;
        await byPhoneLegacy.save().catch(() => undefined);
      }
      return { contact: byPhoneLegacy, created: false, matchedBy: 'phoneLegacy' };
    }
  }

  // 4. Channels (handles + phone-keyed WhatsApp)
  const channelsToProbe = buildChannelsFromInput(input).filter(c => c.type !== 'email' && c.type !== 'phone');
  for (const ch of channelsToProbe) {
    const byChannel = await CrmContact.findOne({
      ...brandScope,
      'channels.type': ch.type,
      'channels.identifier': ch.identifier,
    }).exec();
    if (byChannel) return { contact: byChannel, created: false, matchedBy: 'channel' };
  }

  if (!input.createIfMissing) {
    return { contact: null, created: false, matchedBy: null };
  }

  if (!input.createdById) {
    throw new Error('resolveContact: createIfMissing=true requires createdById');
  }

  // Create. First identifier becomes part of the new doc.
  const firstName = input.defaults?.firstName?.trim() || deriveFirstNameFromIdentifier({ email: normEmail, phone: normPhone, handles: input.socialHandles });
  const lastName = input.defaults?.lastName?.trim();
  const channels = buildChannelsFromInput(input);

  const newContact = new CrmContact({
    brandId: brandIdObj ?? undefined,
    firstName,
    lastName,
    email: normEmail ?? undefined,
    phone: normPhone ?? undefined,
    channels,
    source: input.source ?? 'api',
    sourceDetails: input.defaults?.sourceDetails,
    createdById: new Types.ObjectId(input.createdById),
  });

  try {
    await newContact.save();
  } catch (err: unknown) {
    // Race-condition: another writer created the contact between our lookup
    // and our save. Re-resolve once without createIfMissing and return that.
    const isDup = err instanceof Error && /duplicate key/i.test(err.message);
    if (isDup) {
      const retry = await resolveContact({ ...input, createIfMissing: false });
      if (retry.contact) return retry;
    }
    throw err;
  }

  publishDomainEvent({
    type: 'contact.created',
    brandId: input.brandId ?? undefined,
    source: 'identity.resolveContact',
    payload: {
      contactId: String(newContact._id),
      source: input.source ?? 'api',
      matchedBy: 'created',
      hasEmail: !!normEmail,
      hasPhone: !!normPhone,
    },
  });

  return { contact: newContact, created: true, matchedBy: 'created' };
}

function deriveFirstNameFromIdentifier(args: {
  email: string | null;
  phone: string | null;
  handles?: Partial<Record<SocialPlatform, string>>;
}): string {
  if (args.email) {
    const local = args.email.split('@')[0];
    if (local) return local;
  }
  if (args.handles) {
    for (const v of Object.values(args.handles)) {
      if (v) return v;
    }
  }
  if (args.phone) return args.phone;
  return 'Unknown';
}

/* ----------------------------- Merge ----------------------------- */

export interface MergeContactsInput {
  /** Surviving contact id — receives all the merged data. */
  keepId: string;
  /** Contact ids that will be merged into `keepId` and then deleted. */
  mergeIds: string[];
  performedById: string;
  /** Optional: where the merge was initiated from. */
  source?: 'ui' | 'api' | 'workflow' | 'system';
}

export interface MergeContactsResult {
  contact: ICrmContact;
  mergedCount: number;
}

/**
 * Merge `mergeIds` into `keepId`. Channels, tags, custom fields, and engagement
 * counters fold into the survivor; primitive fields (email, phone, firstName…)
 * are only copied if the survivor is missing them. The losers are deleted.
 * An audit-log entry of action `merged` is written for each loser.
 */
export async function mergeContacts(input: MergeContactsInput): Promise<MergeContactsResult> {
  await ensureConnection();
  if (input.mergeIds.includes(input.keepId)) {
    throw new Error('mergeContacts: keepId cannot appear in mergeIds');
  }

  const keep = await CrmContact.findOne({ _id: input.keepId }).exec();
  if (!keep) throw new Error(`mergeContacts: keep contact ${input.keepId} not found`);

  const losers = await CrmContact.find({
    _id: { $in: input.mergeIds.map(id => new Types.ObjectId(id)) }
  }).exec();

  if (losers.length === 0) return { contact: keep, mergedCount: 0 };

  for (const loser of losers) {
    // Primitive fields: fill only when survivor lacks them.
    if (!keep.email && loser.email) keep.email = loser.email;
    if (!keep.phone && loser.phone) {
      keep.phone = loser.phone;
      keep.phoneNormalized = loser.phoneNormalized;
    }
    if (!keep.lastName && loser.lastName) keep.lastName = loser.lastName;
    if (!keep.jobTitle && loser.jobTitle) keep.jobTitle = loser.jobTitle;
    if (!keep.department && loser.department) keep.department = loser.department;
    if (!keep.avatar && loser.avatar) keep.avatar = loser.avatar;
    if (!keep.companyId && loser.companyId) keep.companyId = loser.companyId;
    if (!keep.ownerId && loser.ownerId) {
      keep.ownerId = loser.ownerId;
      keep.assignedAt = loser.assignedAt;
    }
    if (!keep.address && loser.address) keep.address = loser.address;
    if (!keep.socialProfiles && loser.socialProfiles) keep.socialProfiles = loser.socialProfiles;

    // Channels: union by (type, identifier).
    const seen = new Set(keep.channels.map(c => `${c.type}:${c.identifier}`));
    for (const ch of loser.channels) {
      const k = `${ch.type}:${ch.identifier}`;
      if (!seen.has(k)) {
        keep.channels.push(ch);
        seen.add(k);
      }
    }

    // Tags: union.
    const tagSet = new Set(keep.tags.map(t => String(t)));
    for (const t of loser.tags) {
      const ts = String(t);
      if (!tagSet.has(ts)) {
        keep.tags.push(t);
        tagSet.add(ts);
      }
    }

    // Custom fields: keep survivor's value, take loser's only when missing.
    if (loser.customFields) {
      keep.customFields = keep.customFields ?? {};
      for (const [k, v] of Object.entries(loser.customFields)) {
        if (!(k in keep.customFields)) (keep.customFields as Record<string, unknown>)[k] = v;
      }
    }

    // Engagement counters: sum.
    keep.totalActivities = (keep.totalActivities ?? 0) + (loser.totalActivities ?? 0);
    keep.totalEmails = (keep.totalEmails ?? 0) + (loser.totalEmails ?? 0);

    // Latest timestamps.
    keep.lastActivityAt = maxDate(keep.lastActivityAt, loser.lastActivityAt);
    keep.lastContactedAt = maxDate(keep.lastContactedAt, loser.lastContactedAt);
    keep.lastEmailAt = maxDate(keep.lastEmailAt, loser.lastEmailAt);
    keep.lastCalendarEventAt = maxDate(keep.lastCalendarEventAt, loser.lastCalendarEventAt);

    // Consent: most permissive wins (legally safest is the opposite, but the
    // typical UX expectation is "merge keeps the higher-engagement state").
    // Caller can override via post-merge update.
    if (loser.marketingConsent && !keep.marketingConsent) {
      keep.marketingConsent = true;
      keep.consentTimestamp = maxDate(keep.consentTimestamp, loser.consentTimestamp);
    }
    if (loser.doNotContact) {
      // doNotContact is restrictive — preserve it.
      keep.doNotContact = true;
    }
  }

  await keep.save();

  // Audit each loser.
  const auditDocs = losers.map(loser => ({
    entityType: 'CrmContact',
    entityId: keep._id,
    entityName: `${keep.firstName ?? ''} ${keep.lastName ?? ''}`.trim() || keep.email || keep.phone,
    action: 'merged' as const,
    changes: [{
      field: 'mergedFrom',
      oldValue: { _id: loser._id, email: loser.email, phone: loser.phone, firstName: loser.firstName, lastName: loser.lastName },
      newValue: { _id: keep._id },
    }],
    source: input.source ?? 'api',
    userId: new Types.ObjectId(input.performedById),
  }));
  if (auditDocs.length > 0) {
    await CrmAuditLog.insertMany(auditDocs).catch(() => undefined);
  }

  // Delete the losers.
  await CrmContact.deleteMany({
    _id: { $in: losers.map(l => l._id) }
  }).exec();

  publishDomainEvent({
    type: 'contact.merged',
    brandId: keep.brandId ? String(keep.brandId) : undefined,
    source: 'identity.mergeContacts',
    payload: {
      keepId: String(keep._id),
      mergedIds: losers.map(l => String(l._id)),
      mergedCount: losers.length,
      performedBy: input.performedById,
    },
  });

  return { contact: keep, mergedCount: losers.length };
}

function maxDate(a?: Date | null, b?: Date | null): Date | undefined {
  if (a && b) return a > b ? a : b;
  return (a ?? b) ?? undefined;
}
