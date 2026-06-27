/**
 * B3-1.3 — Inbox conversations → CRM identity backfill.
 *
 * `inbox_conversations.contactId` already refs `CrmContact` structurally.
 * This sweep handles two cases:
 *
 *  1. Conversation rows whose contactId no longer resolves (deleted contact).
 *  2. Conversation rows whose `metadata.{phoneNumber,visitorEmail,senderUsername}`
 *     indicates a person who is now in the CRM under a different contactId
 *     (e.g. WhatsApp resolved them but the inbox conversation was opened earlier).
 *
 * The repair uses `resolveContact` with the channel-specific identifier and
 * (optionally) creates the contact when missing.
 */

import mongoose, { Types } from 'mongoose';
import InboxConversation from '@/lib/db/models/inbox-conversation.model';
import CrmContact from '@/lib/db/models/crm/contact.model';
import { resolveContact, type ResolveContactInput } from '../resolver';
import { normalizeEmail, normalizePhoneForMatch } from '../normalize';
import type { BackfillOptions, BackfillReport } from './types';

async function ensureConnection() {
  if (mongoose.connection.readyState !== 1) {
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();
  }
}

interface MetadataView {
  phoneNumber?: string;
  threadId?: string;
  senderId?: string;
  senderUsername?: string;
  senderName?: string;
  visitorEmail?: string;
  visitorName?: string;
  [k: string]: unknown;
}

/**
 * Pull whatever identifier(s) the conversation metadata carries and shape them
 * into a `ResolveContactInput`.
 */
function identifierFromMetadata(orgId: string, meta: MetadataView | undefined): Partial<ResolveContactInput> {
  if (!meta) return {};

  const phone = normalizePhoneForMatch(meta.phoneNumber);
  const email = normalizeEmail(meta.visitorEmail);
  const result: Partial<ResolveContactInput> = {};

  if (phone) {
    result.phone = phone;
    result.socialHandles = { whatsapp: phone };
  }
  if (email) result.email = email;

  // Instagram / Facebook senders.
  if (meta.senderUsername) {
    result.socialHandles = {
      ...result.socialHandles,
      instagram: typeof meta.senderUsername === 'string' ? meta.senderUsername : undefined,
    };
  }
  return result;
}

function deriveFirstName(meta: MetadataView | undefined): string | undefined {
  if (!meta) return undefined;
  return (meta.senderName as string | undefined)
    ?? (meta.senderUsername as string | undefined)
    ?? (meta.visitorName as string | undefined);
}

export async function backfillInboxConversations(options: BackfillOptions): Promise<BackfillReport> {
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

  const cursor = InboxConversation.find({ }).cursor({ batchSize });

  for await (const doc of cursor) {
    if (report.scanned >= cap) break;
    report.scanned++;

    try {
      const live = await CrmContact.exists({ _id: doc.contactId });
      if (live) {
        report.alreadyLinked++;
        continue;
      }

      const meta = doc.metadata as MetadataView | undefined;
      const identifiers = identifierFromMetadata(options.createdById!, meta);

      if (!identifiers.phone && !identifiers.email && !identifiers.socialHandles) {
        report.unresolved++;
        report.errors.push({ rowId: String(doc._id), reason: 'no resolvable identifier in metadata' });
        continue;
      }

      const resolution = await resolveContact({
        ...identifiers,
        createIfMissing: options.createMissing,
        createdById: options.createdById,
        source: 'whatsapp',
        defaults: {
          firstName: deriveFirstName(meta),
          sourceDetails: { backfilledFrom: 'inbox-conversations', inboxConversationId: String(doc._id) },
        },
      });

      if (!resolution.contact) {
        report.unresolved++;
        report.errors.push({ rowId: String(doc._id), reason: 'identifier did not resolve and createMissing=false' });
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
