/**
 * Social → CRM bridge (B2-4.2).
 *
 * When a social platform event arrives (DM, comment, mention), resolve the
 * sender to a CRM contact via B3's X2 resolver and surface the interaction
 * on the contact's unified timeline as a `crm_activity` row with
 * `type: 'social'`. Per B3-3.4, the unified timeline service already queries
 * activities — so this is the cheapest possible bridge: write activities,
 * timeline shows them automatically.
 *
 * Cross-branch note: imports of `@/lib/identity` and the activity repository
 * use dynamic / string-specifier resolution. The bridge compiles on
 * `bundle-2-strengthening` (where those B3 modules aren't present) and
 * resolves at runtime once B3 merges into v0.5.
 *
 * Producers (Instagram DM listener, X mentions worker, LinkedIn comment
 * webhook, Facebook page event handler, TikTok comment poller, YouTube
 * comment poller) call `recordSocialInteraction()` instead of writing to
 * the timeline directly.
 */

import { publishDomainEvent } from '@/lib/events/domain-bus';
import { Types } from 'mongoose';

export type SocialPlatform =
  | 'instagram'
  | 'linkedin'
  | 'x'
  | 'facebook'
  | 'tiktok'
  | 'youtube'
  | 'pinterest';

export type SocialEventType = 'mention' | 'comment' | 'dm' | 'follower' | 'like';

export interface SocialInteraction {
  /** Brand the social account belongs to (resolves via top-nav picker / account settings). */
  brandId?: string | null;
  /** When the event arrived. */
  timestamp?: Date;
  /** Platform the event came from. */
  platform: SocialPlatform;
  /** What kind of interaction. */
  eventType: SocialEventType;
  /** Provider-side identifier (post id / comment id / DM id). */
  externalId: string;
  /** Sender's handle on the platform (`@username`). */
  senderHandle?: string;
  /** Sender's display name. */
  senderName?: string;
  /** Sender's email if the platform exposes it (rare — usually only LinkedIn). */
  senderEmail?: string;
  /** Sender's phone if exposed (rare). */
  senderPhone?: string;
  /** Free-form payload (post snippet / comment text / DM body / etc). */
  body?: string;
  /** Permalink to the source content. */
  url?: string;
  /** Provider metadata pass-through. */
  metadata?: Record<string, unknown>;
}

export interface RecordSocialInteractionResult {
  contactId?: string;
  contactCreated?: boolean;
  activityId?: string;
  matchedBy?: string;
  /** True if the resolver / activity write was skipped because cross-bundle modules aren't present. */
  skipped?: boolean;
  reason?: string;
}

interface IdentityModule {
  resolveContact: (args: {
    brandId?: string | null;
    email?: string;
    phone?: string;
    socialHandles?: Record<string, string>;
    source?: string;
    createIfMissing?: boolean;
  }) => Promise<{
    contact: { _id: string | { toString(): string } };
    created: boolean;
    matchedBy: string;
  }>;
}

async function tryLoadIdentity(): Promise<IdentityModule | null> {
  const modulePath = '@/lib/identity';
  try {
    return (await import(/* webpackIgnore: true */ modulePath)) as unknown as IdentityModule;
  } catch {
    return null;
  }
}

interface ActivityRepository {
  create: (args: Record<string, unknown>) => Promise<{ _id: string | { toString(): string } }>;
}

async function tryLoadActivityRepo(): Promise<ActivityRepository | null> {
  const modulePath = '@/lib/db/repository/crm/activity.repository';
  try {
    const mod = (await import(/* webpackIgnore: true */ modulePath)) as unknown as {
      activityRepository?: ActivityRepository;
      default?: ActivityRepository;
    };
    return mod.activityRepository ?? mod.default ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the sender → CRM contact, write an activity, emit a domain event.
 *
 * Best-effort: a missing identity module / activity repo logs and returns
 * `skipped: true` rather than throwing — the caller's social-event flow
 * should continue regardless of the bridge.
 */
export async function recordSocialInteraction(
  event: SocialInteraction
): Promise<RecordSocialInteractionResult> {
  const result: RecordSocialInteractionResult = {};

  // 1. Resolve sender → contact (via X2).
  const identity = await tryLoadIdentity();
  if (identity) {
    try {
      const socialHandles = event.senderHandle
        ? { [event.platform]: event.senderHandle }
        : undefined;
      const resolved = await identity.resolveContact({
        brandId: event.brandId,
        email: event.senderEmail,
        phone: event.senderPhone,
        socialHandles,
        source: `social.${event.platform}.${event.eventType}`,
        createIfMissing: true,
      });
      result.contactId = typeof resolved.contact._id === 'string'
        ? resolved.contact._id
        : resolved.contact._id.toString();
      result.contactCreated = resolved.created;
      result.matchedBy = resolved.matchedBy;
    } catch (error) {
      console.error('[social.crm-bridge] resolveContact failed:', error);
    }
  } else {
    result.skipped = true;
    result.reason = '@/lib/identity not present — merge B3 branch first';
  }

  // 2. Write a CRM activity so the unified timeline surfaces the event.
  const activityRepo = await tryLoadActivityRepo();
  if (activityRepo && result.contactId) {
    try {
      const activity = await activityRepo.create({
        brandId: event.brandId ? new Types.ObjectId(event.brandId) : undefined,
        contactId: new Types.ObjectId(result.contactId),
        type: 'social',
        subtype: `${event.platform}.${event.eventType}`,
        summary: event.body?.slice(0, 200) ?? `${event.platform} ${event.eventType}`,
        body: event.body,
        externalId: event.externalId,
        url: event.url,
        platform: event.platform,
        timestamp: event.timestamp ?? new Date(),
        metadata: event.metadata,
      });
      result.activityId = typeof activity._id === 'string'
        ? activity._id
        : activity._id.toString();
    } catch (error) {
      console.error('[social.crm-bridge] activity write failed:', error);
    }
  } else if (!activityRepo) {
    result.skipped = true;
    result.reason = result.reason
      ? `${result.reason}; @/lib/db/repository/crm/activity.repository not present`
      : '@/lib/db/repository/crm/activity.repository not present';
  }

  // 3. Publish domain event so workflow triggers / analytics can react.
  publishDomainEvent({
    type: 'social.interaction_recorded',
    brandId: event.brandId ?? undefined,
    source: 'social.crm-bridge',
    payload: {
      platform: event.platform,
      eventType: event.eventType,
      externalId: event.externalId,
      contactId: result.contactId,
      contactCreated: result.contactCreated,
      activityId: result.activityId,
    },
  });

  return result;
}
