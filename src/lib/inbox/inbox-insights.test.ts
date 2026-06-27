
import { it, expect } from 'vitest';
import {
  buildInboxAnalytics,
  buildInboxConversationQuery,
  calculateInboxLeaderboardScore,
} from './inbox-insights';

it('buildInboxConversationQuery supports unassigned inbox filtering and search', () => {
  const query = buildInboxConversationQuery({
    organizationId: '507f1f77bcf86cd799439011',
    assignedFilter: 'unassigned',
    search: 'acme',
  });

  expect(query.organizationId.toString()).toBe('507f1f77bcf86cd799439011');
  expect(query.assignedToId).toBe(null);
  expect(Array.isArray(query.$or)).toBe(true);
  expect(query.$or?.length).toBe(5);
  expect((query.$or?.[0] as Record<string, RegExp>)['metadata.phoneNumber'].source).toBe('acme');
});

it('buildInboxAnalytics reads csatRating and produces channel, day, and agent summaries', () => {
  const analytics = buildInboxAnalytics({
    conversations: [
      {
        status: 'open',
        createdAt: new Date('2026-03-20T10:00:00.000Z'),
        channelId: 'channel-a',
        assignedToId: 'agent-1',
        firstResponseTime: 180,
        averageResponseTime: 300,
        csatRating: 4,
      },
      {
        status: 'resolved',
        createdAt: new Date('2026-03-21T12:00:00.000Z'),
        channelId: 'channel-a',
        assignedToId: 'agent-1',
        averageResponseTime: 600,
        csatRating: 5,
      },
      {
        status: 'pending',
        createdAt: new Date('2026-03-21T13:00:00.000Z'),
        channelId: 'channel-b',
        assignedToId: 'agent-2',
        firstResponseTime: 60,
      },
    ],
    channels: [
      { _id: 'channel-a', channelType: 'email' },
      { _id: 'channel-b', channelType: 'whatsapp' },
    ],
  });

  expect(analytics.summary).toEqual({
    totalConversations: 3,
    openConversations: 1,
    resolvedConversations: 1,
    avgFirstResponseTime: 2,
    avgResponseTime: 8,
    avgCSAT: 4.5,
  });
  expect(analytics.volumeByChannel).toEqual({
    email: 2,
    whatsapp: 1,
  });
  expect(analytics.volumeByDay).toEqual({
    '2026-03-20': 1,
    '2026-03-21': 2,
  });
  expect(analytics.agentPerformance).toEqual({
    'agent-1': {
      totalConversations: 2,
      resolvedConversations: 1,
      avgResponseTime: 450,
    },
    'agent-2': {
      totalConversations: 1,
      resolvedConversations: 0,
      avgResponseTime: 0,
    },
  });
});

it('calculateInboxLeaderboardScore stays finite when CSAT is missing', () => {
  const score = calculateInboxLeaderboardScore({
    totalConversations: 12,
    resolvedConversations: 9,
    avgResponseTime: 240,
    avgCSAT: null,
  });

  expect(Number.isFinite(score)).toBe(true);
  expect(score > 0).toBe(true);
});
