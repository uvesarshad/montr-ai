import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { connectMongoose } from '@/lib/mongodb';
import AgentMission from '@/lib/db/models/agent-mission.model';

function getOrganizationId(session: { user?: { id?: string; } } | null) {
  return session?.user?.id || session?.user?.id || '';
}

/**
 * GET /api/v2/agent/analytics
 * Returns mission-level analytics for the current user's org.
 * Query params: brandId?, days? (default 30)
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id!;
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get('brandId') || undefined;
  const days = Math.min(365, Math.max(1, Number(searchParams.get('days') ?? 30)));

  try {
    await connectMongoose();

    const since = new Date(Date.now() - days * 86_400_000);
    const baseFilter: Record<string, unknown> = { userId, createdAt: { $gte: since } };
    if (brandId) baseFilter.brandId = brandId;

    const missions = await AgentMission.find(baseFilter)
      .select('status activeAgentId usage createdAt updatedAt lastActivityAt')
      .lean()
      .exec();

    const total = missions.length;
    const byStatus: Record<string, number> = {};
    const byAgent: Record<string, number> = {};
    let totalTokens = 0;
    let totalToolCalls = 0;
    let totalDurationMs = 0;
    let durationCount = 0;

    for (const m of missions) {
      const status = (m as { status: string }).status;
      const agentId = ((m as { activeAgentId: string }).activeAgentId ?? 'unknown').replace(/-agent$/, '');
      const usage = (m as { usage?: { tokens?: number; toolCalls?: number } }).usage ?? {};

      byStatus[status] = (byStatus[status] ?? 0) + 1;
      byAgent[agentId] = (byAgent[agentId] ?? 0) + 1;
      totalTokens += usage.tokens ?? 0;
      totalToolCalls += usage.toolCalls ?? 0;

      const created = new Date((m as { createdAt: string | Date }).createdAt).getTime();
      const updated = new Date((m as { updatedAt: string | Date }).updatedAt).getTime();
      if (updated > created) {
        totalDurationMs += updated - created;
        durationCount++;
      }
    }

    const completed = byStatus.completed ?? 0;
    const failed = (byStatus.blocked ?? 0);
    const successRate = (completed + failed) > 0 ? Math.round((completed / (completed + failed)) * 100) : null;
    const avgDurationMin = durationCount > 0 ? Math.round(totalDurationMs / durationCount / 60_000) : null;

    // Top agents by usage.
    const topAgents = Object.entries(byAgent)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([agent, count]) => ({ agent, count }));

    return NextResponse.json({
      period: { days, since: since.toISOString() },
      total,
      byStatus,
      successRate,
      avgDurationMin,
      totalTokens,
      totalToolCalls,
      topAgents,
    });
  } catch (error) {
    console.error('Error fetching agent analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
