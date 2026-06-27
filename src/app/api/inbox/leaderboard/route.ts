import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import InboxConversation from '@/lib/db/models/inbox-conversation.model';
import { calculateInboxLeaderboardScore } from '@/lib/inbox/inbox-insights';

/**
 * GET /api/inbox/leaderboard
 * Get agent performance leaderboard
 */
export async function GET(req: NextRequest) {
    try {
        const session = await getSession();
        const { searchParams } = new URL(req.url);
        const period = searchParams.get('period') || '30d';

        const now = new Date();
        const startDate = new Date();
        switch (period) {
            case '7d':
                startDate.setDate(now.getDate() - 7);
                break;
            case '30d':
                startDate.setDate(now.getDate() - 30);
                break;
            case '90d':
                startDate.setDate(now.getDate() - 90);
                break;
            default:
                startDate.setDate(now.getDate() - 30);
                break;
        }

        const leaderboard = await InboxConversation.aggregate([
            {
                $match: {
                    assignedToId: { $exists: true, $ne: null },
                    createdAt: { $gte: startDate },
                },
            },
            {
                $group: {
                    _id: '$assignedToId',
                    totalConversations: { $sum: 1 },
                    resolvedConversations: {
                        $sum: {
                            $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0],
                        },
                    },
                    avgResponseTime: { $avg: '$averageResponseTime' },
                    totalMessages: { $sum: '$totalMessages' },
                    avgCSAT: { $avg: '$csatRating' },
                    csatCount: {
                        $sum: {
                            $cond: [{ $ne: ['$csatRating', null] }, 1, 0],
                        },
                    },
                },
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'agent',
                },
            },
            {
                $unwind: '$agent',
            },
        ]);

        const rankedLeaderboard = leaderboard
            .map((agent) => {
                const totalConversations = Number(agent.totalConversations || 0);
                const resolvedConversations = Number(agent.resolvedConversations || 0);
                const avgResponseTime = typeof agent.avgResponseTime === 'number' ? Math.round(agent.avgResponseTime) : null;
                const avgCSAT = typeof agent.avgCSAT === 'number' ? Math.round(agent.avgCSAT * 100) / 100 : null;
                const resolutionRate = totalConversations > 0
                    ? (resolvedConversations / totalConversations) * 100
                    : 0;
                const score = calculateInboxLeaderboardScore({
                    totalConversations,
                    resolvedConversations,
                    avgResponseTime,
                    avgCSAT,
                });

                return {
                    agentId: agent._id,
                    agentName: agent.agent.name,
                    agentEmail: agent.agent.email,
                    agentAvatar: agent.agent.image,
                    totalConversations,
                    resolvedConversations,
                    resolutionRate: Math.round(resolutionRate * 10) / 10,
                    avgResponseTime,
                    totalMessages: Number(agent.totalMessages || 0),
                    avgMessagesPerConversation: totalConversations > 0
                        ? Math.round((Number(agent.totalMessages || 0) / totalConversations) * 10) / 10
                        : 0,
                    avgCSAT,
                    csatCount: Number(agent.csatCount || 0),
                    score: Math.round(score * 10) / 10,
                };
            })
            .sort((left, right) => right.score - left.score)
            .map((agent, index) => ({
                ...agent,
                rank: index + 1,
            }));

        return NextResponse.json({
            leaderboard: rankedLeaderboard,
            period,
            generatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}
