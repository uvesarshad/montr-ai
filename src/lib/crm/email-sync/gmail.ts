import { ICrmEmailAccount } from '@/lib/db/models/crm/email-account.model';
import { emailRepository } from '@/lib/db/repository/crm/email.repository';
import { emailAccountRepository } from '@/lib/db/repository/crm/email-account.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { blocklistRepository } from '@/lib/db/repository/crm/blocklist.repository';
import { resolveOrCreateContactForSender } from './contact-auto-create';
import { notifyInboundEmail } from './inbound-trigger';
import { refreshOAuthToken, SendEmailOptions, SendEmailResult } from './index';

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    parts?: Array<{
      mimeType: string;
      body: {
        data?: string;
        attachmentId?: string;
        size: number;
      };
      filename?: string;
    }>;
    body?: {
      data?: string;
      size: number;
    };
  };
  internalDate: string;
}

/**
 * Sync Gmail account emails
 */
export async function syncGmailAccount(account: ICrmEmailAccount): Promise<void> {
  try {
    console.log(`[Gmail Sync] Starting sync for account: ${account.email}`);

    // Refresh OAuth token if needed
    const { accessToken } = await refreshOAuthToken(account);

    // Update account with fresh token
    if (accessToken !== account.oauth?.accessToken) {
      await emailAccountRepository.updateOAuth(
        account._id.toString(),
        {
          ...account.oauth!,
          accessToken,
        }
      );
    }

    // Build query for Gmail API
    const query = buildGmailQuery(account);

    // Fetch messages from Gmail
    const messages = await fetchGmailMessages(accessToken, query, account.syncCursor);

    console.log(`[Gmail Sync] Found ${messages.length} messages to sync`);

    let syncedCount = 0;

    for (const messageId of messages) {
      try {
        // Get full message details
        const message = await fetchGmailMessage(accessToken, messageId);

        // Check if message already exists
        const existing = await emailRepository.findByMessageId(
          account._id.toString(),
          message.id
        );

        if (existing) {
          console.log(`[Gmail Sync] Message ${message.id} already exists, skipping`);
          continue;
        }

        // Parse message
        const parsedEmail = parseGmailMessage(message);

        // Resolve / auto-create the linked contact for this message's sender.
        // Blocked senders are stored but never linked or auto-created.
        let contactId: string | undefined;
        const senderEmail = parsedEmail.from?.email;
        const blocked = senderEmail
          ? await blocklistRepository.isBlocked(senderEmail)
          : false;
        if (!blocked && parsedEmail.direction === 'inbound') {
          const resolved = await resolveOrCreateContactForSender(account, parsedEmail.from);
          contactId = resolved ?? undefined;
        } else if (!blocked && account.autoLinkContacts && senderEmail) {
          // Outbound (or non-create) path keeps simple link-only behavior.
          contactId = await findContactByEmail(senderEmail);
        }

        // Create email record
        const createdEmail = await emailRepository.create({
          accountId: account._id.toString(),
          messageId: message.id,
          threadId: message.threadId,
          from: parsedEmail.from,
          to: parsedEmail.to,
          cc: parsedEmail.cc,
          replyTo: parsedEmail.replyTo,
          inReplyTo: parsedEmail.inReplyTo,
          references: parsedEmail.references,
          subject: parsedEmail.subject,
          bodyHtml: parsedEmail.bodyHtml,
          bodyText: parsedEmail.bodyText,
          snippet: message.snippet,
          date: new Date(parseInt(message.internalDate)),
          folder: parsedEmail.folder,
          labels: message.labelIds || [],
          isRead: !message.labelIds?.includes('UNREAD'),
          isStarred: message.labelIds?.includes('STARRED') || false,
          direction: parsedEmail.direction,
          contactId,
          hasAttachments: parsedEmail.hasAttachments,
          attachments: parsedEmail.attachments,
        });

        // Drive automation off newly-stored inbound mail:
        // email_received trigger + email wait-for-reply resume.
        if (parsedEmail.direction === 'inbound') {
          await notifyInboundEmail({
            account,
            emailId: String((createdEmail as { _id?: unknown })?._id ?? message.id),
            messageId: message.id,
            contactId,
            fromEmail: senderEmail,
            subject: parsedEmail.subject,
            snippet: message.snippet,
          }).catch(() => { /* best-effort — logged inside */ });
        }

        syncedCount++;
      } catch (error) {
        console.error(`[Gmail Sync] Error syncing message ${messageId}:`, error);
        // Continue with next message
      }
    }

    console.log(`[Gmail Sync] Successfully synced ${syncedCount} messages`);

    // Update sync state
    await emailAccountRepository.updateSyncState(account._id.toString(), {
      lastSyncAt: new Date(),
      lastSyncError: undefined,
      totalEmailsSynced: account.totalEmailsSynced + syncedCount,
    });
  } catch (error) {
    console.error(`[Gmail Sync] Error syncing account ${account.email}:`, error);

    // Update sync state with error
    await emailAccountRepository.updateSyncState(account._id.toString(), {
      lastSyncAt: new Date(),
      lastSyncError: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

/**
 * Send email via Gmail
 */
export async function sendGmailEmail(
  account: ICrmEmailAccount,
  options: SendEmailOptions
): Promise<SendEmailResult> {
  try {
    // Refresh OAuth token if needed
    const { accessToken } = await refreshOAuthToken(account);

    // Build RFC 2822 email message
    const emailMessage = buildRfc2822Message(account, options);

    // Send via Gmail API
    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw: Buffer.from(emailMessage).toString('base64url'),
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[Gmail Send] Error:', error);
      return {
        success: false,
        error: 'Failed to send email via Gmail',
      };
    }

    const data = await response.json();

    // Create email record
    const email = await emailRepository.create({
      accountId: account._id.toString(),
      messageId: data.id,
      threadId: data.threadId,
      from: { email: account.email, name: account.displayName },
      to: options.to,
      cc: options.cc || [],
      replyTo: options.replyTo,
      inReplyTo: options.inReplyTo,
      subject: options.subject,
      bodyHtml: options.bodyHtml,
      bodyText: options.bodyText,
      date: new Date(),
      folder: 'sent',
      labels: ['SENT'],
      isRead: true,
      direction: 'outbound',
      contactId: options.contactId,
      companyId: options.companyId,
      dealId: options.dealId,
      hasAttachments: !!options.attachments && options.attachments.length > 0,
    });

    return {
      success: true,
      messageId: data.id,
      email,
    };
  } catch (error) {
    console.error('[Gmail Send] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    };
  }
}

/**
 * Build Gmail API query
 */
function buildGmailQuery(account: ICrmEmailAccount): string {
  const queries: string[] = [];

  // Sync folders
  if (account.syncFolders.length > 0) {
    const folderQuery = account.syncFolders.map((folder) => {
      if (folder === 'INBOX') return 'in:inbox';
      if (folder === 'Sent') return 'in:sent';
      return `label:${folder}`;
    }).join(' OR ');
    queries.push(`(${folderQuery})`);
  }

  // Sync from start date
  if (account.syncStartDate) {
    const date = Math.floor(account.syncStartDate.getTime() / 1000);
    queries.push(`after:${date}`);
  }

  return queries.join(' ');
}

/**
 * Fetch Gmail messages
 */
async function fetchGmailMessages(
  accessToken: string,
  query: string,
  pageToken?: string
): Promise<string[]> {
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('q', query);
  url.searchParams.set('maxResults', '100');
  if (pageToken) {
    url.searchParams.set('pageToken', pageToken);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch Gmail messages');
  }

  const data = await response.json();
  return data.messages?.map((m: { id: string }) => m.id) || [];
}

/**
 * Fetch single Gmail message
 */
async function fetchGmailMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessage> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Gmail message ${messageId}`);
  }

  return response.json();
}

/**
 * Parse Gmail message
 */
function parseGmailMessage(message: GmailMessage) {
  const headers = message.payload.headers;

  const getHeader = (name: string): string | undefined => {
    return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
  };

  const parseAddresses = (header: string | undefined): Array<{ email: string; name?: string }> => {
    if (!header) return [];
    return header.split(',').map((addr) => {
      const match = addr.match(/(?:"?([^"]*)"?\s)?<?([^>]+)>?/);
      return {
        email: match?.[2]?.trim() || addr.trim(),
        name: match?.[1]?.trim(),
      };
    });
  };

  // Determine folder based on labels
  let folder = 'inbox';
  if (message.labelIds?.includes('SENT')) {
    folder = 'sent';
  } else if (message.labelIds?.includes('DRAFT')) {
    folder = 'drafts';
  } else if (message.labelIds?.includes('TRASH')) {
    folder = 'trash';
  }

  // Determine direction
  const from = parseAddresses(getHeader('From'))[0];
  const direction: 'inbound' | 'outbound' = folder === 'sent' ? 'outbound' : 'inbound';

  // Extract body
  let bodyHtml: string | undefined;
  let bodyText: string | undefined;
  let hasAttachments = false;
  const attachments: { attachmentId: string; fileName: string; mimeType: string; size: number }[] = [];

  type GmailPart = { mimeType?: string; body?: { data?: string; attachmentId?: string; size?: number }; filename?: string; parts?: GmailPart[] };
  const extractBody = (part: GmailPart) => {
    if (part.mimeType === 'text/html' && part.body?.data) {
      bodyHtml = Buffer.from(part.body.data, 'base64url').toString('utf-8');
    } else if (part.mimeType === 'text/plain' && part.body?.data) {
      bodyText = Buffer.from(part.body.data, 'base64url').toString('utf-8');
    } else if (part.filename && part.body?.attachmentId) {
      hasAttachments = true;
      attachments.push({
        attachmentId: part.body.attachmentId,
        fileName: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body.size || 0,
      });
    }

    if (part.parts) {
      part.parts.forEach(extractBody);
    }
  };

  if (message.payload.parts) {
    message.payload.parts.forEach(extractBody);
  } else if (message.payload.body?.data) {
    // @ts-expect-error
    const mimeType = message.payload.mimeType || 'text/plain';
    const data = Buffer.from(message.payload.body.data, 'base64url').toString('utf-8');
    if (mimeType === 'text/html') {
      bodyHtml = data;
    } else {
      bodyText = data;
    }
  }

  return {
    from,
    to: parseAddresses(getHeader('To')),
    cc: parseAddresses(getHeader('Cc')),
    replyTo: getHeader('Reply-To'),
    inReplyTo: getHeader('In-Reply-To'),
    references: getHeader('References')?.split(/\s+/) || [],
    subject: getHeader('Subject'),
    bodyHtml,
    bodyText,
    folder,
    direction,
    hasAttachments,
    attachments,
  };
}

/**
 * Build RFC 2822 email message
 */
function buildRfc2822Message(account: ICrmEmailAccount, options: SendEmailOptions): string {
  const lines: string[] = [];

  // From
  lines.push(`From: ${account.displayName ? `"${account.displayName}" <${account.email}>` : account.email}`);

  // To
  lines.push(`To: ${options.to.map((addr) => addr.name ? `"${addr.name}" <${addr.email}>` : addr.email).join(', ')}`);

  // Cc
  if (options.cc && options.cc.length > 0) {
    lines.push(`Cc: ${options.cc.map((addr) => addr.name ? `"${addr.name}" <${addr.email}>` : addr.email).join(', ')}`);
  }

  // Subject
  lines.push(`Subject: ${options.subject || '(No Subject)'}`);

  // Reply-To
  if (options.replyTo) {
    lines.push(`Reply-To: ${options.replyTo}`);
  }

  // In-Reply-To
  if (options.inReplyTo) {
    lines.push(`In-Reply-To: ${options.inReplyTo}`);
  }

  // MIME headers
  lines.push('MIME-Version: 1.0');
  lines.push('Content-Type: text/html; charset=UTF-8');
  lines.push('Content-Transfer-Encoding: quoted-printable');

  // Empty line between headers and body
  lines.push('');

  // Body
  lines.push(options.bodyHtml || options.bodyText || '');

  return lines.join('\r\n');
}

/**
 * Find contact by email
 */
async function findContactByEmail(
  email: string
): Promise<string | undefined> {
  try {
    const contact = await contactRepository.findByEmail(email);
    return contact?._id.toString();
  } catch (error) {
    console.error('[Gmail Sync] Error finding contact by email:', error);
    return undefined;
  }
}
