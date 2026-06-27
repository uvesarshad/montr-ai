import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { pipelineRepository } from '@/lib/db/repository/crm/pipeline.repository';
import CrmDeal from '@/lib/db/models/crm/deal.model';

/**
 * GET /api/v2/crm/stats/stage-conversion
 *
 * Stage-by-stage conversion funnel derived from each deal's stageHistory.
 *
 * Method ("history-advance"): for the pipeline's stages ordered by `order`,
 *   - entered:   # of (non-deleted) deals that ever entered the stage
 *   - advanced:  # of those deals that subsequently reached a LATER stage in
 *                the pipeline order (a later stage appears in stageHistory) OR
 *                are currently won.
 *   - conversionRate = advanced / entered (0..1)
 *   - avgDurationDays = avg time spent in the stage (from stageHistory
 *                       enteredAt→exitedAt; uses `duration` ms when present,
 *                       else exitedAt−enteredAt; open/un-exited entries skipped)
 *
 * Org-scoped, deletedAt:null. Params: pipelineId? (default = org default).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    const ctx = await getCrmPermissionContext(userId);
    assertCrmPermission(ctx, 'contact', 'read');
    const { searchParams } = new URL(req.url);
    const pipelineIdParam = searchParams.get('pipelineId') || undefined;

    const pipeline = pipelineIdParam
      ? await pipelineRepository.findById(pipelineIdParam)
      : await pipelineRepository.findDefault();

    if (!pipeline) {
      return NextResponse.json(
        { error: 'Pipeline not found', method: 'history-advance', stages: [] },
        { status: 404 },
      );
    }

    // Stage order map: stageId -> { order, name, type }
    const orderedStages = [...pipeline.stages].sort((a, b) => a.order - b.order);
    const stageMeta = new Map<string, { order: number; name: string; type: string }>();
    orderedStages.forEach((s) => {
      stageMeta.set(s._id.toString(), { order: s.order, name: s.name, type: s.type });
    });

    const deals = await CrmDeal.find(
      {
        pipelineId: pipeline._id,
        deletedAt: null,
      },
      { stageHistory: 1, status: 1 },
    ).lean().exec();

    // Per-stage accumulators
    interface Acc { entered: number; advanced: number; durSum: number; durCount: number; }
    const acc = new Map<string, Acc>();
    orderedStages.forEach((s) =>
      acc.set(s._id.toString(), { entered: 0, advanced: 0, durSum: 0, durCount: 0 }),
    );

    const DAY = 1000 * 60 * 60 * 24;

    for (const deal of deals) {
      const history = (deal.stageHistory || []) as Array<{
        stageId: Types.ObjectId;
        enteredAt?: Date;
        exitedAt?: Date;
        duration?: number;
      }>;
      const isWon = deal.status === 'won';

      // Max stage order this deal ever reached.
      let maxOrderReached = -1;
      const enteredStageIds = new Set<string>();
      for (const h of history) {
        const id = h.stageId?.toString();
        const meta = id ? stageMeta.get(id) : undefined;
        if (!meta) continue;
        enteredStageIds.add(id);
        if (meta.order > maxOrderReached) maxOrderReached = meta.order;
      }

      // Count entered + duration once per (deal, stage) it touched.
      for (const id of enteredStageIds) {
        const a = acc.get(id);
        const meta = stageMeta.get(id);
        if (!a || !meta) continue;
        a.entered += 1;

        // advanced = reached a strictly later stage, or deal is won.
        if (isWon || maxOrderReached > meta.order) a.advanced += 1;
      }

      // Durations — sum every closed history entry per stage.
      for (const h of history) {
        const id = h.stageId?.toString();
        const a = id ? acc.get(id) : undefined;
        if (!a) continue;
        let ms: number | null = null;
        if (typeof h.duration === 'number' && h.duration > 0) {
          ms = h.duration;
        } else if (h.enteredAt && h.exitedAt) {
          ms = new Date(h.exitedAt).getTime() - new Date(h.enteredAt).getTime();
        }
        if (ms !== null && ms >= 0) {
          a.durSum += ms;
          a.durCount += 1;
        }
      }
    }

    const stages = orderedStages.map((s) => {
      const id = s._id.toString();
      const a = acc.get(id)!;
      const conversionRate = a.entered > 0 ? a.advanced / a.entered : 0;
      const avgDurationDays =
        a.durCount > 0 ? Math.round((a.durSum / a.durCount / DAY) * 10) / 10 : null;
      return {
        stageId: id,
        stageName: s.name,
        type: s.type,
        order: s.order,
        entered: a.entered,
        advanced: a.advanced,
        conversionRate: Math.round(conversionRate * 1000) / 1000,
        avgDurationDays,
      };
    });

    return NextResponse.json({
      method: 'history-advance',
      methodNote:
        'entered = deals whose stageHistory ever included the stage; advanced = those that later reached a higher-order stage or are won; conversionRate = advanced/entered.',
      pipelineId: pipeline._id.toString(),
      pipelineName: pipeline.name,
      totalDeals: deals.length,
      stages,
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error building stage conversion report:', error);
    return NextResponse.json({ error: 'Failed to build stage conversion report' }, { status: 500 });
  }
}
