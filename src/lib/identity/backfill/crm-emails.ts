/**
 * B3-1.4 — Email-sync recipients → CRM identity audit.
 *
 * `crm_emails.contactId` is optional and only set when the email-sync linker
 * managed to match a contact at ingest time. This sweep fills the gaps:
 *
 *  - Inbound emails (folder='inbox' or 'archive'): resolve via `from.email`.
 *  - Outbound emails (folder='sent', or direction='outbound'): resolve via the
 *    first `to[]` address.
 *  - If a contact is found/created, set `contactId` + `isLinked: true`.
 *
 * Idempotent: rows that already have `contactId` set are skipped.
 */

import mongoose, { Types } from 'mongoose';
import CrmEmail from '@/lib/db/models/crm/email.model';
import { resolveContact } from '../resolver';
import { normalizeEmail } from '../normalize';
import type { BackfillOptions, BackfillReport } from './types';

async function ensureConnection() {
  if (mongoose.connection.readyState !== 1) {
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();
  }
}

export async function backfillCrmEmails(options: BackfillOptions): Promise<BackfillReport> {
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

  // Only audit rows missing contactId. Already-linked rows are out of scope.
  const cursor = CrmEmail.find({
    $or: [{ contactId: { $exists: false } }, { contactId: null }],
  }).cursor({ batchSize });

  for await (const doc of cursor) {
    if (report.scanned >= cap) break;
    report.scanned++;

    try {
      if (doc.contactId) {
        report.alreadyLinked++;
        continue;
      }

      const candidateEmail = pickCandidateEmail(doc);
      if (!candidateEmail) {
        report.unresolved++;
        report.errors.push({ rowId: String(doc._id), reason: 'no candidate email in from/to' });
        continue;
      }

      const resolution = await resolveContact({
        email: candidateEmail,
        createIfMissing: options.createMissing,
        createdById: options.createdById,
        source: 'email',
        defaults: {
          firstName: candidateEmail.split('@')[0],
          sourceDetails: { backfilledFrom: 'crm-emails', emailId: String(doc._id) },
        },
      });

      if (!resolution.contact) {
        report.unresolved++;
        report.errors.push({ rowId: String(doc._id), reason: `${candidateEmail} did not resolve and createMissing=false` });
        continue;
      }

      if (resolution.created) report.created++;

      if (!options.dryRun) {
        doc.contactId = resolution.contact._id as Types.ObjectId;
        doc.isLinked = true;
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

function pickCandidateEmail(doc: { direction?: string; folder?: string; from?: { email?: string }; to?: Array<{ email?: string }> }): string | null {
  // Inbound → use `from`.
  const isInbound = doc.direction === 'inbound' || doc.folder === 'inbox' || doc.folder === 'archive';
  if (isInbound) {
    return normalizeEmail(doc.from?.email);
  }
  // Outbound → use first `to`.
  const first = doc.to?.[0]?.email;
  return normalizeEmail(first);
}
