import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { strategyRepository } from '@/lib/db/repository/strategy.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { generateStrategy } from '@/lib/strategy/generator';
import { z } from 'zod';

const createStrategySchema = z.object({
  brandId: z.string().min(1),
  goal: z.string().min(1).max(500),
  constraints: z.string().max(500).optional(),
});

/**
 * GET /api/v2/agent/strategies
 * List strategies for the user's org, optionally filtered by brandId.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id!;
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get('brandId') || undefined;

  try {
    const user = await userRepository.findById(userId);
    const orgId = user!.id?.toString() ?? userId;

    const strategies = await strategyRepository.findByBrand(orgId, brandId ?? '');

    return NextResponse.json({ strategies, total: strategies.length });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch strategies' }, { status: 500 });
  }
}

/**
 * POST /api/v2/agent/strategies
 * Kick off strategy generation (B1-1.2).
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id!;
  const body = await request.json();

  try {
    const { brandId, goal, constraints } = createStrategySchema.parse(body);
    const user = await userRepository.findById(userId);
    const orgId = user!.id?.toString() ?? userId;

    const strategy = await generateStrategy({ orgId, brandId, goal, constraints, userId });
    return NextResponse.json(strategy, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    const msg = error instanceof Error ? error.message : 'Strategy generation failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
