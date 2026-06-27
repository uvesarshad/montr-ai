import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { strategyRepository } from '@/lib/db/repository/strategy.repository';
import { decomposeStrategy } from '@/lib/strategy/generator';
import { instantiateRoadmap } from '@/lib/strategy/instantiate';
import { userRepository } from '@/lib/db/repository/user.repository';

/**
 * GET /api/v2/agent/strategies/[id]
 * Strategy detail + roadmap.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  try {
    const [strategy, roadmap] = await Promise.all([
      strategyRepository.findById(id),
      strategyRepository.getRoadmap(id),
    ]);
    if (!strategy) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ strategy, roadmap });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch strategy' }, { status: 500 });
  }
}

/**
 * POST /api/v2/agent/strategies/[id]/decompose
 * Decompose strategy into a roadmap (B1-1.3).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id!;
  const { id } = await params;
  const { action } = await request.json().catch(() => ({ action: 'decompose' }));

  try {
    const user = await userRepository.findById(userId);
    const orgId = user!.id?.toString() ?? userId;
    const strategy = await strategyRepository.findById(id);
    if (!strategy) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const brandId = strategy.brandId?.toString() ?? '';

    if (action === 'instantiate') {
      const result = await instantiateRoadmap({ strategyId: id, orgId, brandId, userId });
      return NextResponse.json(result);
    }

    const result = await decomposeStrategy(id, { orgId, brandId, userId });
    return NextResponse.json({ roadmap: result.roadmap });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
