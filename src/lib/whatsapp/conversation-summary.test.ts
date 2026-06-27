import { it, expect } from 'vitest';

import {
  buildWhatsAppConversationDefaults,
  buildWhatsAppConversationSummary,
} from './conversation-summary';

it('buildWhatsAppConversationSummary includes persisted conversation metadata', () => {
  const summary = buildWhatsAppConversationSummary({
    contact: {
      _id: 'contact-1',
      firstName: 'Ava',
      lastName: 'Stone',
      channels: [{ type: 'whatsapp', identifier: '+15550001' }],
    },
    lastMessage: {
      _id: 'activity-1',
      bodyPlain: 'Can you send the quote?',
      createdAt: '2026-03-22T10:15:00.000Z',
      messageMetadata: {
        direction: 'inbound',
      },
    },
    unreadCount: 2,
    conversation: {
      _id: 'conversation-1',
      internalNotes: 'Needs pricing follow-up',
    },
  });

  expect(summary.conversationId).toBe('conversation-1');
  expect(summary.internalNotes).toBe('Needs pricing follow-up');
  expect(summary.lastMessage?.direction).toBe('inbound');
});

it('buildWhatsAppConversationDefaults derives seed metadata for a new conversation record', () => {
  const defaults = buildWhatsAppConversationDefaults({
    organizationId: 'org-1',
    accountId: 'account-1',
    contactId: 'contact-1',
    totalMessages: 4,
    lastMessage: {
      createdAt: '2026-03-22T10:15:00.000Z',
      messageMetadata: {
        direction: 'outbound',
      },
    },
  });

  expect(defaults.organizationId).toBe('org-1');
  expect(defaults.accountId).toBe('account-1');
  expect(defaults.contactId).toBe('contact-1');
  expect(defaults.totalMessages).toBe(4);
  expect(defaults.status).toBe('open');
  expect(defaults.priority).toBe('medium');
  expect(defaults.lastMessageType).toBe('outgoing');
  expect(defaults.lastMessageAt?.toISOString()).toBe('2026-03-22T10:15:00.000Z');
});
