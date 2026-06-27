/**
 * Unified contact timeline (B3-3.4).
 *
 * Aggregates events touching a single CRM contact from every channel into one
 * chronological stream. Replaces the activity-only timeline on the contact
 * detail page.
 *
 * Sources (current):
 *  - crm_activities (notes, tasks, meetings, calls — the existing timeline)
 *  - crm_emails (1:1 IMAP/SMTP — inbound + outbound)
 *  - whatsapp_messages (inbound + outbound)
 *  - inbox_messages (omnichannel — IG, FB, web chat, telegram, etc.)
 *
 * Sources (TODO when their bundles land):
 *  - voice_call_sessions (bundle-3-voice-strengthening — merge later)
 *  - social interactions (B2-4.2 social → CRM bridge)
 *  - form_submissions (B3-4.5.1 forms → CRM resolver)
 *
 * Strategy: query each source for the top N rows touching this contact, merge
 * into a common envelope, sort by timestamp desc, slice to the requested limit.
 * O(N * sources) per request — acceptable up to ~25 per source. For deeper
 * scrolls the caller passes a `cursor` (timestamp) and we re-query each source
 * for rows older than that.
 */

import mongoose, { Types } from 'mongoose';
import CrmActivity from '@/lib/db/models/crm/activity.model';
import CrmEmail from '@/lib/db/models/crm/email.model';
import WhatsAppMessage from '@/lib/db/models/whatsapp-message.model';
import InboxMessage from '@/lib/db/models/inbox-message.model';
import CallSession from '@/lib/db/models/voice/call-session.model';

export type TimelineEventKind =
  | 'activity'
  | 'email'
  | 'whatsapp_message'
  | 'inbox_message'
  | 'voice_call'        // TODO: voice subsystem merge (bundle-3-voice-strengthening)
  | 'social_interaction'// TODO: B2-4.2 social → CRM bridge
  | 'form_submission';  // TODO: B3-4.5.1 forms → CRM resolver

export interface TimelineEvent {
  id: string;
  kind: TimelineEventKind;
  /** Visual channel label — 'whatsapp', 'email', 'inbox-instagram', etc. */
  channel: string;
  /** Sort key: when this event happened. */
  timestamp: string; // ISO
  /** Short headline rendered as the row title. */
  title: string;
  /** Optional one-line preview (max ~200 chars rendered). */
  snippet?: string;
  direction?: 'inbound' | 'outbound' | 'internal';
  /** Deep-link target inside the app, if the event has its own detail page. */
  href?: string;
  /** Free-form per-kind extras for renderers. */
  meta?: Record<string, unknown>;
}

export interface UnifiedTimelineOptions {
  contactId: string;
  /** Max events per source AND total. Default 25. */
  limit?: number;
  /** ISO date string. Only events strictly older than this are returned. */
  before?: string;
}

export interface UnifiedTimelineResult {
  events: TimelineEvent[];
  /** Cursor for the next page; null when no more results. */
  nextBefore: string | null;
  /** Per-source diagnostic counts; useful when a source quietly errors. */
  sourceCounts: Record<TimelineEventKind, number>;
}

async function ensureConnection() {
  if (mongoose.connection.readyState !== 1) {
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();
  }
}

export async function fetchUnifiedTimeline(options: UnifiedTimelineOptions): Promise<UnifiedTimelineResult> {
  await ensureConnection();

  const limit = options.limit ?? 25;
  const before = options.before ? new Date(options.before) : null;
  const contactObjId = new Types.ObjectId(options.contactId);

  const beforeFilter = before ? { $lt: before } : undefined;

  const [activityDocs, emailDocs, whatsappDocs, inboxDocs, voiceCallDocs] = await Promise.all([
    CrmActivity.find({
      targetType: 'contact',
      targetId: contactObjId,
      ...(beforeFilter ? { createdAt: beforeFilter } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec()
      .catch(() => []),

    CrmEmail.find({
      contactId: contactObjId,
      ...(beforeFilter ? { date: beforeFilter } : {}),
    })
      .sort({ date: -1 })
      .limit(limit)
      .lean()
      .exec()
      .catch(() => []),

    WhatsAppMessage.find({
      contactId: contactObjId,
      ...(beforeFilter ? { createdAt: beforeFilter } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec()
      .catch(() => []),

    InboxMessage.find({
      contactId: contactObjId,
      ...(beforeFilter ? { createdAt: beforeFilter } : {}),
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .exec()
      .catch(() => []),

    // Voice calls — match contact on either side of the call.
    CallSession.find({
      $or: [{ fromContactId: contactObjId }, { toContactId: contactObjId }],
      ...(beforeFilter ? { startedAt: beforeFilter } : {}),
    })
      .sort({ startedAt: -1 })
      .limit(limit)
      .lean()
      .exec()
      .catch(() => []),
  ]);

  const events: TimelineEvent[] = [];

  for (const a of activityDocs as Array<Record<string, unknown>>) {
    events.push({
      id: String(a._id),
      kind: 'activity',
      channel: String(a.type ?? 'note'),
      timestamp: new Date(a.createdAt as Date).toISOString(),
      title: stringField(a, 'subject') || stringField(a, 'type') || 'Activity',
      snippet: truncate(stringField(a, 'description'), 200),
      direction: 'internal',
      meta: { activityType: a.type, completedAt: a.completedAt, dueDate: a.dueDate },
    });
  }

  for (const e of emailDocs as Array<Record<string, unknown>>) {
    const direction = (e.direction === 'outbound' ? 'outbound' : 'inbound') as TimelineEvent['direction'];
    events.push({
      id: String(e._id),
      kind: 'email',
      channel: 'email',
      timestamp: new Date((e.date ?? e.createdAt) as Date).toISOString(),
      title: stringField(e, 'subject') || '(no subject)',
      snippet: truncate(stringField(e, 'snippet') || stringField(e, 'bodyText'), 200),
      direction,
      href: `/crm/emails/${String(e._id)}`,
      meta: { from: e.from, to: e.to, hasAttachments: e.hasAttachments },
    });
  }

  for (const m of whatsappDocs as Array<Record<string, unknown>>) {
    const direction = (m.direction === 'outbound' ? 'outbound' : 'inbound') as TimelineEvent['direction'];
    events.push({
      id: String(m._id),
      kind: 'whatsapp_message',
      channel: 'whatsapp',
      timestamp: new Date(m.createdAt as Date).toISOString(),
      title: m.isNote ? 'Internal note' : (direction === 'outbound' ? 'Sent message' : 'Received message'),
      snippet: truncate(stringField(m, 'content'), 200),
      direction,
      meta: { messageType: m.messageType, status: m.status, templateName: m.templateName },
    });
  }

  for (const m of inboxDocs as Array<Record<string, unknown>>) {
    const direction = (m.direction === 'outbound' ? 'outbound' : 'inbound') as TimelineEvent['direction'];
    events.push({
      id: String(m._id),
      kind: 'inbox_message',
      channel: 'inbox',
      timestamp: new Date(m.createdAt as Date).toISOString(),
      title: m.isNote ? 'Internal note' : (direction === 'outbound' ? 'Sent message' : 'Received message'),
      snippet: truncate(stringField(m, 'content'), 200),
      direction,
      meta: { messageType: m.messageType, status: m.status, channelId: String(m.channelId) },
    });
  }

  for (const c of voiceCallDocs as Array<Record<string, unknown>>) {
    const direction = (c.direction === 'inbound' ? 'inbound' : 'outbound') as TimelineEvent['direction'];
    const duration = typeof c.durationSec === 'number' ? c.durationSec : undefined;
    const status = String(c.status ?? 'unknown');
    const counterpartyNumber = direction === 'outbound' ? c.toNumber : c.fromNumber;
    const title = direction === 'outbound'
      ? `Outbound call to ${counterpartyNumber}`
      : `Inbound call from ${counterpartyNumber}`;
    const snippetParts: string[] = [`${status}`];
    if (typeof duration === 'number') {
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      snippetParts.push(`${mins}m ${secs.toString().padStart(2, '0')}s`);
    }
    const disposition = c.disposition as { outcome?: string } | undefined;
    if (disposition?.outcome) snippetParts.push(disposition.outcome);
    events.push({
      id: String(c._id),
      kind: 'voice_call',
      channel: 'voice',
      timestamp: new Date((c.startedAt ?? c.createdAt) as Date).toISOString(),
      title,
      snippet: snippetParts.join(' · '),
      direction,
      href: `/crm/voice/calls/${String(c._id)}`,
      meta: {
        providerId: c.providerId,
        providerCallId: c.providerCallId,
        durationSec: duration,
        recordingUrl: c.recordingUrl,
        transcriptId: c.transcriptId,
        endReason: c.endReason,
      },
    });
  }

  events.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));

  const sliced = events.slice(0, limit);
  const nextBefore = sliced.length === limit ? sliced[sliced.length - 1].timestamp : null;

  const sourceCounts: Record<TimelineEventKind, number> = {
    activity: activityDocs.length,
    email: emailDocs.length,
    whatsapp_message: whatsappDocs.length,
    inbox_message: inboxDocs.length,
    voice_call: voiceCallDocs.length,
    social_interaction: 0,
    form_submission: 0,
  };

  return { events: sliced, nextBefore, sourceCounts };
}

function stringField(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
}

function truncate(s: string | undefined, n: number): string | undefined {
  if (!s) return undefined;
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
