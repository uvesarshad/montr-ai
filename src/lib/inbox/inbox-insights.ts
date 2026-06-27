import { Types } from 'mongoose';

type InboxConversationStatus = 'open' | 'pending' | 'resolved' | 'closed';

interface InboxConversationFilterInput {
  channelId?: string | null;
  status?: InboxConversationStatus | 'all' | null;
  assignedFilter?: string | null;
  search?: string | null;
}

interface InboxAnalyticsConversation {
  status: InboxConversationStatus;
  createdAt: Date | string;
  channelId?: string | { toString(): string } | null;
  assignedToId?: string | { toString(): string } | null;
  firstResponseTime?: number | null;
  averageResponseTime?: number | null;
  csatRating?: number | null;
}

interface InboxAnalyticsChannel {
  _id: string | { toString(): string };
  channelType: string;
}

interface InboxAnalyticsInput {
  conversations: InboxAnalyticsConversation[];
  channels: InboxAnalyticsChannel[];
}

interface LeaderboardScoreInput {
  totalConversations: number;
  resolvedConversations: number;
  avgResponseTime: number | null;
  avgCSAT: number | null;
}

type ConversationQuery = {
  channelId?: Types.ObjectId;
  status?: InboxConversationStatus;
  assignedToId?: Types.ObjectId | null;
  $or?: Array<Record<string, RegExp>>;
};

const SEARCH_FIELDS = [
  'metadata.phoneNumber',
  'metadata.email',
  'metadata.subject',
  'metadata.senderUsername',
  'metadata.visitorEmail',
] as const;

export function buildInboxConversationQuery({ channelId, status, assignedFilter, search }: InboxConversationFilterInput): ConversationQuery {
  const query: ConversationQuery = {
};

  if (channelId && channelId !== 'all') {
    query.channelId = new Types.ObjectId(channelId);
  }

  if (status && status !== 'all') {
    query.status = status;
  }

  if (assignedFilter === 'unassigned') {
    query.assignedToId = null;
  } else if (
    assignedFilter &&
    assignedFilter !== 'all' &&
    Types.ObjectId.isValid(assignedFilter)
  ) {
    query.assignedToId = new Types.ObjectId(assignedFilter);
  }

  const trimmedSearch = search?.trim();
  if (trimmedSearch) {
    const searchRegex = new RegExp(escapeRegex(trimmedSearch), 'i');
    query.$or = SEARCH_FIELDS.map((field) => ({ [field]: searchRegex }));
  }

  return query;
}

export function buildInboxAnalytics({ conversations, channels }: InboxAnalyticsInput) {
  const channelTypeById = new Map(
    channels.map((channel) => [channel._id.toString(), channel.channelType])
  );

  const totalConversations = conversations.length;
  const openConversations = conversations.filter((conversation) => conversation.status === 'open').length;
  const resolvedConversations = conversations.filter((conversation) => conversation.status === 'resolved').length;

  const conversationsWithFirstResponse = conversations.filter(
    (conversation) => typeof conversation.firstResponseTime === 'number'
  );
  const avgFirstResponseTime = conversationsWithFirstResponse.length > 0
    ? conversationsWithFirstResponse.reduce(
      (sum, conversation) => sum + Number(conversation.firstResponseTime || 0),
      0
    ) / conversationsWithFirstResponse.length
    : 0;

  const conversationsWithAvgResponse = conversations.filter(
    (conversation) => typeof conversation.averageResponseTime === 'number'
  );
  const avgResponseTime = conversationsWithAvgResponse.length > 0
    ? conversationsWithAvgResponse.reduce(
      (sum, conversation) => sum + Number(conversation.averageResponseTime || 0),
      0
    ) / conversationsWithAvgResponse.length
    : 0;

  const conversationsWithCSAT = conversations.filter(
    (conversation) => typeof conversation.csatRating === 'number'
  );
  const avgCSAT = conversationsWithCSAT.length > 0
    ? conversationsWithCSAT.reduce(
      (sum, conversation) => sum + Number(conversation.csatRating || 0),
      0
    ) / conversationsWithCSAT.length
    : 0;

  const volumeByChannel: Record<string, number> = {};
  const volumeByDay: Record<string, number> = {};
  const agentPerformance: Record<string, { totalConversations: number; resolvedConversations: number; avgResponseTime: number }> = {};
  const agentResponseTotals: Record<string, { total: number; count: number }> = {};

  for (const conversation of conversations) {
    const createdAt = new Date(conversation.createdAt);
    const day = createdAt.toISOString().split('T')[0];
    const channelId = conversation.channelId?.toString();
    const channelType = (channelId && channelTypeById.get(channelId)) || 'unknown';
    const agentId = conversation.assignedToId?.toString();

    volumeByChannel[channelType] = (volumeByChannel[channelType] || 0) + 1;
    volumeByDay[day] = (volumeByDay[day] || 0) + 1;

    if (!agentId) {
      continue;
    }

    if (!agentPerformance[agentId]) {
      agentPerformance[agentId] = {
        totalConversations: 0,
        resolvedConversations: 0,
        avgResponseTime: 0,
      };
      agentResponseTotals[agentId] = {
        total: 0,
        count: 0,
      };
    }

    const agentEntry = agentPerformance[agentId];
    agentEntry.totalConversations += 1;
    if (conversation.status === 'resolved') {
      agentEntry.resolvedConversations += 1;
    }

    if (typeof conversation.averageResponseTime === 'number') {
      agentResponseTotals[agentId].total += conversation.averageResponseTime;
      agentResponseTotals[agentId].count += 1;
      agentEntry.avgResponseTime =
        agentResponseTotals[agentId].total / agentResponseTotals[agentId].count;
    }
  }

  return {
    summary: {
      totalConversations,
      openConversations,
      resolvedConversations,
      avgFirstResponseTime: Math.round(avgFirstResponseTime / 60),
      avgResponseTime: Math.round(avgResponseTime / 60),
      avgCSAT: Math.round(avgCSAT * 10) / 10,
    },
    volumeByChannel,
    volumeByDay,
    agentPerformance,
  };
}

export function calculateInboxLeaderboardScore({
  totalConversations,
  resolvedConversations,
  avgResponseTime,
  avgCSAT,
}: LeaderboardScoreInput) {
  if (totalConversations <= 0) {
    return 0;
  }

  const safeCSAT = avgCSAT ?? 0;
  const safeResponseTime = avgResponseTime ?? 0;
  const resolutionRate = resolvedConversations / totalConversations;
  const csatScore = (safeCSAT / 5) * 30;
  const responseScore = (1 - Math.min(safeResponseTime / 3600, 1)) * 20;
  const volumeScore = Math.min(totalConversations / 100, 1) * 10;

  return resolutionRate * 40 + csatScore + responseScore + volumeScore;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
