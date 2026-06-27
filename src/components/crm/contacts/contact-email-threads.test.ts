import { it, expect } from 'vitest';

import { Email } from '@/hooks/crm/use-emails';
import { buildContactEmailThreads } from './contact-email-threads';

function buildEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'email-1',
    accountId: 'account-1',
    messageId: 'message-1',
    threadId: 'thread-1',
    from: {
      email: 'owner@montr.ai',
      name: 'Montr AI',
    },
    to: [
      {
        email: 'ava@example.com',
        name: 'Ava Stone',
      },
    ],
    cc: [],
    subject: 'Follow up',
    snippet: 'Checking in on the proposal',
    bodyText: 'Checking in on the proposal',
    date: new Date('2026-03-20T08:00:00.000Z'),
    folder: 'sent',
    labels: [],
    isRead: true,
    isStarred: false,
    isArchived: false,
    isDraft: false,
    isLinked: true,
    direction: 'outbound',
    hasAttachments: false,
    attachments: [],
    ...overrides,
  };
}

it('buildContactEmailThreads groups emails by thread and sorts by latest message date', () => {
  const threads = buildContactEmailThreads([
    buildEmail({
      id: 'email-1',
      threadId: 'thread-1',
      date: new Date('2026-03-18T08:00:00.000Z'),
      isRead: false,
      direction: 'inbound',
      from: { email: 'ava@example.com', name: 'Ava Stone' },
      to: [{ email: 'owner@montr.ai', name: 'Montr AI' }],
    }),
    buildEmail({
      id: 'email-2',
      threadId: 'thread-1',
      date: new Date('2026-03-19T08:00:00.000Z'),
      isStarred: true,
    }),
    buildEmail({
      id: 'email-3',
      threadId: 'thread-2',
      subject: '',
      snippet: '',
      bodyText: 'Can we talk pricing next week?',
      date: new Date('2026-03-20T10:00:00.000Z'),
      direction: 'inbound',
      from: { email: 'ceo@acme.com', name: 'Acme CEO' },
      to: [{ email: 'owner@montr.ai', name: 'Montr AI' }],
      hasAttachments: true,
    }),
  ]);

  expect(threads.length).toBe(2);
  expect(threads[0]?.threadId).toBe('thread-2');
  expect(threads[0]?.latestEmailId).toBe('email-3');
  expect(threads[0]?.subject).toBe('(No Subject)');
  expect(threads[0]?.snippet).toBe('Can we talk pricing next week?');
  expect(threads[0]?.counterpartLabel).toBe('Acme CEO');
  expect(threads[0]?.messageCount).toBe(1);
  expect(threads[0]?.unreadCount).toBe(0);
  expect(threads[0]?.hasAttachments).toBe(true);

  expect(threads[1]?.threadId).toBe('thread-1');
  expect(threads[1]?.latestEmailId).toBe('email-2');
  expect(threads[1]?.messageCount).toBe(2);
  expect(threads[1]?.unreadCount).toBe(1);
  expect(threads[1]?.counterpartLabel).toBe('Ava Stone');
  expect(threads[1]?.isStarred).toBe(true);
});
