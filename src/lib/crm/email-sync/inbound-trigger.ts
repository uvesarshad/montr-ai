/**
 * Inbound-email side effects shared by every email poller (IMAP / Gmail /
 * Outlook). Called once per newly-stored INBOUND email so a connected mailbox
 * actually drives automation:
 *
 *   1. `dispatchTrigger({ kind: 'email_received' })` — start any active workflow
 *      whose trigger subType is `email_received` in the account's org.
 *   2. `resumePausedExecutionsForChannelMessage({ channel: 'email' })` — light up
 *      any workflow parked on a `wait_for_channel_response` (email) node for the
 *      resolved contact, so email wait-for-reply resumes instead of timing out.
 *
 * Both calls are best-effort: failures are logged and never propagate into the
 * sync loop (a trigger error must not abort or fail an email sync). Org is read
 * from the email-account record, never from message content.
 */

import { ICrmEmailAccount } from '@/lib/db/models/crm/email-account.model';

export async function notifyInboundEmail(params: {
  account: ICrmEmailAccount;
  /** Stored email record id (used as the dispatch idempotency key). */
  emailId: string;
  /** Provider message-id, when available. */
  messageId?: string;
  /** Resolved/linked CRM contact id for the sender, if any. */
  contactId?: string;
  fromEmail?: string;
  subject?: string;
  snippet?: string;
}): Promise<void> {
  const { account, emailId, messageId, contactId, fromEmail, subject, snippet } = params;
  // 1) Fire the email_received trigger (non-blocking).
  try {
    const { dispatchTrigger } = await import('@/lib/workflow/triggers/dispatch');
    await dispatchTrigger({
      kind: 'email_received',
      channel: 'email',
      contactId,
      // Keyword matching / downstream nodes read `text`; prefer subject + snippet.
      text: [subject, snippet].filter(Boolean).join(' — ') || '',
      externalId: messageId,
      accountId: account._id?.toString(),
      metadata: { fromEmail, subject, emailId },
      eventId: emailId,
    });
  } catch (err) {
    console.error('[email-sync] email_received dispatch failed:', err);
  }

  // 2) Resume any execution waiting on a channel-message (email) for this contact.
  if (contactId) {
    try {
      const { resumePausedExecutionsForChannelMessage } = await import(
        '@/lib/workflow/resume-channel'
      );
      await resumePausedExecutionsForChannelMessage({
        channel: 'email',
        contactId,
        message: {
          messageId: messageId ?? emailId,
          content: snippet ?? subject ?? '',
          direction: 'inbound',
        },
      });
    } catch (err) {
      console.error('[email-sync] email channel-resume failed:', err);
    }
  }
}
