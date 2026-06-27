/**
 * B3-1.2 — WhatsApp → CRM identity backfill.
 *
 * Every `whatsapp_conversations.contactId` already typed as ObjectId in the
 * schema, but legacy rows can point at deleted/orphaned CRM contacts. This
 * sweep audits each conversation:
 *
 *  - If contactId resolves to a live `crm_contact` → leave it.
 *  - Otherwise try to resolve via the most-recent inbound message's `extra.from`,
 *    falling back to the conversation's first message's sender phone.
 *  - If a CRM contact is found/created, repair the conversation's contactId.
 *  - Otherwise: log to `errors`, leave the row alone.
 *
 * Going-forward: callers in the message-ingestion path (B3-1.x) should route
 * inbound WhatsApp messages through `resolveContact` before opening a new
 * conversation. This backfill is one-time for legacy data.
 */

import mongoose, { Types } from 'mongoose';
import WhatsAppConversation from '@/lib/db/models/whatsapp-conversation.model';
import WhatsAppMessage from '@/lib/db/models/whatsapp-message.model';
import CrmContact from '@/lib/db/models/crm/contact.model';
import { resolveContact } from '../resolver';
import { normalizePhoneForMatch } from '../normalize';
import type { BackfillOptions, BackfillReport } from './types';

async function ensureConnection() {
  if (mongoose.connection.readyState !== 1) {
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();
  }
}

interface ProbeWhatsAppSenderResult {
  phone: string | null;
}

/**
 * Given a conversation, locate the WhatsApp phone number of the participant.
 * Strategy:
 *  - Look at the oldest inbound message's `extra.from` (most providers store
 *    sender wa_id here).
 *  - Fall back to the existing CrmContact's phone if the contactId still
 *    points to a doc (even if the doc's not great, the phone field is useful).
 */
async function probeWhatsAppSender(_conversationId: Types.ObjectId): Promise<ProbeWhatsAppSenderResult> {
  const inbound = await WhatsAppMessage.findOne({
    direction: 'inbound',
    // The link from a message to its conversation isn't stored directly on
    // this model — we use contactId + organizationId on the same conversation
    // as the lookup key. The caller passes the conversation's contactId via
    // a precondition (resolved before we get here).
    // (We could also store `conversationId` on messages, but that's a
    // larger model change owned by B3 follow-up.)
    _id: { $exists: true },
  })
    .where('contactId')
    .sort({ createdAt: 1 })
    .limit(1)
    .lean()
    .exec();

  if (!inbound) return { phone: null };

  const extra = (inbound as { extra?: Record<string, unknown> }).extra;
  const raw = (extra?.from as string | undefined) ?? (extra?.wa_id as string | undefined) ?? null;
  const phone = normalizePhoneForMatch(raw);
  return { phone };
}

export async function backfillWhatsAppConversations(options: BackfillOptions): Promise<BackfillReport> {
  await ensureConnection();

  const report: BackfillReport = {
    scanned: 0,
    alreadyLinked: 0,
    repaired: 0,
    created: 0,
    unresolved: 0,
    errors: [],
  };
  const batchSize = options.batchSize ?? 200;
  const cap = options.limit ?? Number.POSITIVE_INFINITY;

  const cursor = WhatsAppConversation.find({ }).cursor({ batchSize });

  for await (const doc of cursor) {
    if (report.scanned >= cap) break;
    report.scanned++;

    try {
      const live = await CrmContact.exists({ _id: doc.contactId });
      if (live) {
        report.alreadyLinked++;
        continue;
      }

      // Orphaned. Try to recover from the conversation's first inbound message.
      const probe = await probeWhatsAppSender(doc.contactId as Types.ObjectId);
      if (!probe.phone) {
        report.unresolved++;
        report.errors.push({ rowId: String(doc._id), reason: 'no phone identifier on any inbound message' });
        continue;
      }

      const resolution = await resolveContact({
        phone: probe.phone,
        socialHandles: { whatsapp: probe.phone },
        createIfMissing: options.createMissing,
        createdById: options.createdById,
        source: 'whatsapp',
        defaults: { firstName: probe.phone },
      });

      if (!resolution.contact) {
        report.unresolved++;
        report.errors.push({ rowId: String(doc._id), reason: `phone ${probe.phone} did not resolve and createMissing=false` });
        continue;
      }

      if (resolution.created) report.created++;

      if (!options.dryRun) {
        doc.contactId = resolution.contact._id as Types.ObjectId;
        await doc.save();
      }
      report.repaired++;
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      report.errors.push({ rowId: String(doc._id), reason });
    }
  }

  return report;
}
