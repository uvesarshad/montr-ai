import { Email } from '@/hooks/crm/use-emails';

export interface ContactEmailThreadSummary {
  threadId: string;
  latestEmailId: string;
  subject: string;
  snippet: string;
  counterpartLabel: string;
  latestDate: Date;
  messageCount: number;
  unreadCount: number;
  hasAttachments: boolean;
  isStarred: boolean;
}

function getThreadKey(email: Email) {
  return email.threadId || email.id;
}

function getCounterpartLabel(email: Email) {
  if (email.direction === 'outbound') {
    const recipient = email.to[0];
    return recipient?.name || recipient?.email || 'Recipient';
  }

  return email.from.name || email.from.email;
}

export function buildContactEmailThreads(emails: Email[]): ContactEmailThreadSummary[] {
  const groupedThreads = new Map<string, Email[]>();

  for (const email of emails) {
    const threadKey = getThreadKey(email);
    const existing = groupedThreads.get(threadKey);

    if (existing) {
      existing.push(email);
      continue;
    }

    groupedThreads.set(threadKey, [email]);
  }

  return Array.from(groupedThreads.entries())
    .map(([threadId, threadEmails]) => {
      const sortedEmails = [...threadEmails].sort(
        (left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()
      );
      const latestEmail = sortedEmails[0]!;

      return {
        threadId,
        latestEmailId: latestEmail.id,
        subject: latestEmail.subject?.trim() || '(No Subject)',
        snippet: latestEmail.snippet?.trim() || latestEmail.bodyText?.trim() || '',
        counterpartLabel: getCounterpartLabel(latestEmail),
        latestDate: new Date(latestEmail.date),
        messageCount: threadEmails.length,
        unreadCount: threadEmails.filter((email) => !email.isRead).length,
        hasAttachments: threadEmails.some((email) => email.hasAttachments),
        isStarred: threadEmails.some((email) => email.isStarred),
      };
    })
    .sort((left, right) => right.latestDate.getTime() - left.latestDate.getTime());
}
