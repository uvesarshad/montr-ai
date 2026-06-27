import { ICrmEmailAccount } from '@/lib/db/models/crm/email-account.model';
import { emailRepository } from '@/lib/db/repository/crm/email.repository';
import { emailAccountRepository } from '@/lib/db/repository/crm/email-account.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { blocklistRepository } from '@/lib/db/repository/crm/blocklist.repository';
import { resolveOrCreateContactForSender } from './contact-auto-create';
import { notifyInboundEmail } from './inbound-trigger';
import { refreshOAuthToken, SendEmailOptions, SendEmailResult } from './index';

interface OutlookMessage {
  id: string;
  conversationId: string;
  subject: string;
  bodyPreview: string;
  body: {
    contentType: 'text' | 'html';
    content: string;
  };
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  toRecipients: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  ccRecipients: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  replyTo: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  sentDateTime: string;
  receivedDateTime: string;
  isRead: boolean;
  isDraft: boolean;
  hasAttachments: boolean;
  internetMessageId: string;
  parentFolderId: string;
}

/**
 * Sync Outlook account emails
 */
export async function syncOutlookAccount(account: ICrmEmailAccount): Promise<void> {
  try {
    console.log(`[Outlook Sync] Starting sync for account: ${account.email}`);

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

    // Fetch messages from Outlook
    const messages = await fetchOutlookMessages(
      accessToken,
      account.syncFolders,
      account.syncStartDate,
      account.syncCursor
    );

    console.log(`[Outlook Sync] Found ${messages.length} messages to sync`);

    let syncedCount = 0;

    for (const message of messages) {
      try {
        // Check if message already exists
        const existing = await emailRepository.findByMessageId(
          account._id.toString(),
          message.id
        );

        if (existing) {
          console.log(`[Outlook Sync] Message ${message.id} already exists, skipping`);
          continue;
        }

        // Parse message
        const parsedEmail = parseOutlookMessage(message);

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
          contactId = await findContactByEmail(senderEmail);
        }

        // Create email record
        const createdEmail = await emailRepository.create({
          accountId: account._id.toString(),
          messageId: message.id,
          threadId: message.conversationId,
          from: parsedEmail.from,
          to: parsedEmail.to,
          cc: parsedEmail.cc,
          replyTo: parsedEmail.replyTo,
          subject: message.subject,
          bodyHtml: message.body.contentType === 'html' ? message.body.content : undefined,
          bodyText: message.body.contentType === 'text' ? message.body.content : undefined,
          snippet: message.bodyPreview,
          date: new Date(message.sentDateTime),
          folder: parsedEmail.folder,
          isRead: message.isRead,
          direction: parsedEmail.direction,
          contactId,
          hasAttachments: message.hasAttachments,
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
            subject: message.subject,
            snippet: message.bodyPreview,
          }).catch(() => { /* best-effort — logged inside */ });
        }

        syncedCount++;
      } catch (error) {
        console.error(`[Outlook Sync] Error syncing message ${message.id}:`, error);
        // Continue with next message
      }
    }

    console.log(`[Outlook Sync] Successfully synced ${syncedCount} messages`);

    // Update sync state
    await emailAccountRepository.updateSyncState(account._id.toString(), {
      lastSyncAt: new Date(),
      lastSyncError: undefined,
      totalEmailsSynced: account.totalEmailsSynced + syncedCount,
    });
  } catch (error) {
    console.error(`[Outlook Sync] Error syncing account ${account.email}:`, error);

    // Update sync state with error
    await emailAccountRepository.updateSyncState(account._id.toString(), {
      lastSyncAt: new Date(),
      lastSyncError: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

/**
 * Send email via Outlook
 */
export async function sendOutlookEmail(
  account: ICrmEmailAccount,
  options: SendEmailOptions
): Promise<SendEmailResult> {
  try {
    // Refresh OAuth token if needed
    const { accessToken } = await refreshOAuthToken(account);

    // Build message
    const message = {
      subject: options.subject || '(No Subject)',
      body: {
        contentType: options.bodyHtml ? 'HTML' : 'Text',
        content: options.bodyHtml || options.bodyText || '',
      },
      toRecipients: options.to.map((addr) => ({
        emailAddress: {
          address: addr.email,
          name: addr.name,
        },
      })),
      ccRecipients: options.cc?.map((addr) => ({
        emailAddress: {
          address: addr.email,
          name: addr.name,
        },
      })),
      replyTo: options.replyTo ? [{
        emailAddress: {
          address: options.replyTo,
        },
      }] : undefined,
    };

    // Send via Microsoft Graph API
    const response = await fetch(
      'https://graph.microsoft.com/v1.0/me/sendMail',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          saveToSentItems: true,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[Outlook Send] Error:', error);
      return {
        success: false,
        error: 'Failed to send email via Outlook',
      };
    }

    // Create email record (Outlook doesn't return message ID for sent emails)
    const email = await emailRepository.create({
      accountId: account._id.toString(),
      messageId: `sent-${Date.now()}`, // Temporary ID
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
      isRead: true,
      direction: 'outbound',
      contactId: options.contactId,
      companyId: options.companyId,
      dealId: options.dealId,
      hasAttachments: !!options.attachments && options.attachments.length > 0,
    });

    return {
      success: true,
      email,
    };
  } catch (error) {
    console.error('[Outlook Send] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email',
    };
  }
}

/**
 * Fetch Outlook messages
 */
async function fetchOutlookMessages(
  accessToken: string,
  syncFolders: string[],
  syncStartDate?: Date,
  skipToken?: string
): Promise<OutlookMessage[]> {
  const messages: OutlookMessage[] = [];

  for (const folder of syncFolders) {
    const folderMessages = await fetchOutlookFolderMessages(
      accessToken,
      folder,
      syncStartDate,
      skipToken
    );
    messages.push(...folderMessages);
  }

  return messages;
}

/**
 * Fetch messages from a specific Outlook folder
 */
async function fetchOutlookFolderMessages(
  accessToken: string,
  folder: string,
  syncStartDate?: Date,
  skipToken?: string
): Promise<OutlookMessage[]> {
  // Map folder names
  const folderMap: Record<string, string> = {
    'INBOX': 'inbox',
    'Sent': 'sentitems',
  };

  const folderPath = folderMap[folder] || folder.toLowerCase();

  const url = new URL(
    `https://graph.microsoft.com/v1.0/me/mailFolders/${folderPath}/messages`
  );

  url.searchParams.set('$top', '100');
  url.searchParams.set('$orderby', 'receivedDateTime DESC');

  if (syncStartDate) {
    const filter = `receivedDateTime ge ${syncStartDate.toISOString()}`;
    url.searchParams.set('$filter', filter);
  }

  if (skipToken) {
    url.searchParams.set('$skiptoken', skipToken);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Outlook messages from folder ${folder}`);
  }

  const data = await response.json();
  return data.value || [];
}

/**
 * Parse Outlook message
 */
function parseOutlookMessage(message: OutlookMessage) {
  const parseRecipients = (
    recipients: Array<{ emailAddress: { name: string; address: string } }>
  ): Array<{ email: string; name?: string }> => {
    return recipients.map((r) => ({
      email: r.emailAddress.address,
      name: r.emailAddress.name,
    }));
  };

  // Determine folder
  let folder = 'inbox';
  const folderId = message.parentFolderId?.toLowerCase() || '';
  if (folderId.includes('sentitems')) {
    folder = 'sent';
  } else if (folderId.includes('drafts')) {
    folder = 'drafts';
  } else if (folderId.includes('deleteditems')) {
    folder = 'trash';
  }

  // Determine direction
  const direction: 'inbound' | 'outbound' = folder === 'sent' ? 'outbound' : 'inbound';

  return {
    from: {
      email: message.from.emailAddress.address,
      name: message.from.emailAddress.name,
    },
    to: parseRecipients(message.toRecipients || []),
    cc: parseRecipients(message.ccRecipients || []),
    replyTo: message.replyTo?.[0]?.emailAddress.address,
    folder,
    direction,
  };
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
    console.error('[Outlook Sync] Error finding contact by email:', error);
    return undefined;
  }
}
