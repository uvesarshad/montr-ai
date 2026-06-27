import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import Brand from '@/lib/db/models/brand.model';
import AgentMission from '@/lib/db/models/agent-mission.model';
import { connectMongoose } from '@/lib/mongodb';

function getOrganizationId(session: { user?: { id?: string; } } | null) {
  return session?.user?.id || session?.user?.id || '';
}

/**
 * GET /api/v2/agent/agency
 * Returns per-brand mission stats for all brands in the org.
 * Only meaningful when org has ≥2 brands.
 */
export async function GET(request: NextRequest) {
  void request;
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id!;
  try {
    await connectMongoose();
    const brandFilter = { userId };

    const brands = await Brand.find(brandFilter)
      .select('_id name handle avatarUrl')
      .lean()
      .exec();

    if (brands.length < 2) {
      return NextResponse.json({ brands: [], isSingleBrand: true });
    }

    const brandIds = brands.map((b) => String(b._id));

    // Aggregate missions per brand in one query.
    const agg = await AgentMission.aggregate([
      {
        $match: {
          brandId: { $in: brandIds },
        },
      },
      {
        $group: {
          _id: '$brandId',
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $in: ['$status', ['active', 'draft']] }, 1, 0] },
          },
          waiting: {
            $sum: { $cond: [{ $eq: ['$status', 'waiting'] }, 1, 0] },
          },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          blocked: {
            $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] },
          },
          totalTokens: { $sum: '$usage.tokens' },
          totalToolCalls: { $sum: '$usage.toolCalls' },
          lastActivityAt: { $max: '$lastActivityAt' },
        },
      },
    ]).exec();

    const statsByBrand = Object.fromEntries(
      agg.map((row: {
        _id: string;
        total: number;
        active: number;
        waiting: number;
        completed: number;
        blocked: number;
        totalTokens: number;
        totalToolCalls: number;
        lastActivityAt: string | null;
      }) => [row._id, row])
    );

    const result = brands.map((b) => {
      const id = String(b._id);
      const stats = statsByBrand[id] ?? {
        total: 0, active: 0, waiting: 0, completed: 0, blocked: 0,
        totalTokens: 0, totalToolCalls: 0, lastActivityAt: null,
      };
      const finished = stats.completed + stats.blocked;
      return {
        brandId: id,
        name: (b as { name: string }).name,
        handle: (b as { handle?: string }).handle ?? '',
        avatarUrl: (b as { avatarUrl?: string | null }).avatarUrl ?? null,
        total: stats.total,
        active: stats.active,
        waiting: stats.waiting,
        completed: stats.completed,
        blocked: stats.blocked,
        successRate: finished > 0 ? Math.round((stats.completed / finished) * 100) : null,
        totalTokens: stats.totalTokens ?? 0,
        totalToolCalls: stats.totalToolCalls ?? 0,
        lastActivityAt: stats.lastActivityAt ?? null,
      };
    });

    return NextResponse.json({ brands: result, isSingleBrand: false });
  } catch (error) {
    console.error('Error fetching agency stats:', error);
    return NextResponse.json({ error: 'Failed to fetch agency stats' }, { status: 500 });
  }
}
