import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { pipelineRepository } from '@/lib/db/repository/crm/pipeline.repository';
import CrmDeal from '@/lib/db/models/crm/deal.model';

/**
 * GET /api/v2/crm/stats/forecast
 *
 * Sales forecast bucketed into N future periods (month | quarter):
 *   - committed: Σ value of WON deals whose actualCloseDate falls in the period
 *   - weighted:  Σ (value × stage-probability/100) of OPEN deals whose
 *                expectedCloseDate falls in the period (stage probability read
 *                from the deal's pipeline stage; fallback to deal.probability)
 *   - bestCase:  Σ value of OPEN deals in the period (unweighted)
 *   - counts + per-owner breakdown
 *   - overdue:   open deals with expectedCloseDate < now (slip bucket)
 *
 * Org-scoped, soft-deleted rows excluded. Stage probabilities are fetched once
 * from the pipeline(s) and applied in JS over stage-grouped aggregation results.
 *
 * Query params: pipelineId?, period='month'|'quarter' (default month),
 *               horizon=N periods (default 4, max 8), ownerId?
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
    const pipelineId = searchParams.get('pipelineId') || undefined;
    const ownerId = searchParams.get('ownerId') || undefined;
    const period = searchParams.get('period') === 'quarter' ? 'quarter' : 'month';
    const horizon = Math.min(8, Math.max(1, parseInt(searchParams.get('horizon') || '4', 10) || 4));

    // ── Build the period buckets (period start at local-ish UTC month/quarter) ──
    const now = new Date();
    const periods: { start: Date; end: Date; key: string }[] = [];
    if (period === 'quarter') {
      const q = Math.floor(now.getUTCMonth() / 3);
      const baseMonth = q * 3;
      for (let i = 0; i < horizon; i++) {
        const start = new Date(Date.UTC(now.getUTCFullYear(), baseMonth + i * 3, 1));
        const end = new Date(Date.UTC(now.getUTCFullYear(), baseMonth + (i + 1) * 3, 1));
        periods.push({ start, end, key: start.toISOString() });
      }
    } else {
      for (let i = 0; i < horizon; i++) {
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
        const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i + 1, 1));
        periods.push({ start, end, key: start.toISOString() });
      }
    }
    const rangeStart = periods[0].start;
    const rangeEnd = periods[periods.length - 1].end;

    // ── Stage probability lookup (stageId -> probability) from pipeline(s) ──
    const pipelines = pipelineId
      ? [await pipelineRepository.findById(pipelineId)].filter(Boolean)
      : await pipelineRepository.findAll(true);
    const stageProbById = new Map<string, number>();
    for (const pl of pipelines) {
      if (!pl) continue;
      for (const stage of pl.stages) {
        stageProbById.set(stage._id.toString(), stage.probability ?? 0);
      }
    }

    const orgMatch: Record<string, unknown> = {
      deletedAt: null,
    };
    if (pipelineId) orgMatch.pipelineId = new Types.ObjectId(pipelineId);
    if (ownerId) orgMatch.ownerId = new Types.ObjectId(ownerId);

    const periodIndexOf = (d: Date | undefined | null): number => {
      if (!d) return -1;
      const t = new Date(d).getTime();
      if (t < rangeStart.getTime() || t >= rangeEnd.getTime()) return -1;
      for (let i = 0; i < periods.length; i++) {
        if (t >= periods[i].start.getTime() && t < periods[i].end.getTime()) return i;
      }
      return -1;
    };

    // ── Aggregations (run in parallel) ──
    const [committedAgg, openAgg, overdueAgg] = await Promise.all([
      // WON deals grouped by actualCloseDate period + owner
      CrmDeal.aggregate([
        {
          $match: {
            ...orgMatch,
            status: 'won',
            actualCloseDate: { $gte: rangeStart, $lt: rangeEnd },
          },
        },
        {
          $group: {
            _id: { owner: '$ownerId', actualCloseDate: '$actualCloseDate' },
            value: { $sum: '$value' },
            count: { $sum: 1 },
          },
        },
      ]).exec(),
      // OPEN deals grouped by expectedCloseDate + stage + owner (so we can weight in JS)
      CrmDeal.aggregate([
        {
          $match: {
            ...orgMatch,
            status: 'open',
            expectedCloseDate: { $gte: rangeStart, $lt: rangeEnd },
          },
        },
        {
          $group: {
            _id: {
              owner: '$ownerId',
              stageId: '$stageId',
              expectedCloseDate: '$expectedCloseDate',
            },
            value: { $sum: '$value' },
            // weighted using the deal-level probability as a fallback bucket
            fallbackProb: { $avg: '$probability' },
            count: { $sum: 1 },
          },
        },
      ]).exec(),
      // Overdue: open deals with expectedCloseDate < now
      CrmDeal.aggregate([
        {
          $match: {
            ...orgMatch,
            status: 'open',
            expectedCloseDate: { $lt: now },
          },
        },
        {
          $group: { _id: null, value: { $sum: '$value' }, count: { $sum: 1 } },
        },
      ]).exec(),
    ]);

    // ── Roll grouped rows into per-period + per-owner accumulators ──
    interface OwnerAcc { weighted: number; bestCase: number; committed: number; }
    const blankPeriod = () => ({
      committed: 0,
      weighted: 0,
      bestCase: 0,
      counts: { committed: 0, open: 0 },
      byOwner: new Map<string, OwnerAcc>(),
    });
    const buckets = periods.map(() => blankPeriod());

    const ownerKey = (o: unknown) => (o ? String(o) : 'unassigned');
    const ensureOwner = (m: Map<string, OwnerAcc>, k: string): OwnerAcc => {
      let a = m.get(k);
      if (!a) { a = { weighted: 0, bestCase: 0, committed: 0 }; m.set(k, a); }
      return a;
    };

    for (const row of committedAgg) {
      const idx = periodIndexOf(row._id?.actualCloseDate);
      if (idx < 0) continue;
      const b = buckets[idx];
      b.committed += row.value || 0;
      b.counts.committed += row.count || 0;
      ensureOwner(b.byOwner, ownerKey(row._id?.owner)).committed += row.value || 0;
    }

    for (const row of openAgg) {
      const idx = periodIndexOf(row._id?.expectedCloseDate);
      if (idx < 0) continue;
      const b = buckets[idx];
      const value = row.value || 0;
      const stageProb = stageProbById.get(String(row._id?.stageId));
      const prob = stageProb !== undefined ? stageProb : (row.fallbackProb ?? 0);
      const weighted = value * (prob / 100);
      b.weighted += weighted;
      b.bestCase += value;
      b.counts.open += row.count || 0;
      const o = ensureOwner(b.byOwner, ownerKey(row._id?.owner));
      o.weighted += weighted;
      o.bestCase += value;
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const periodsOut = periods.map((p, i) => {
      const b = buckets[i];
      return {
        period: p.key,
        periodEnd: p.end.toISOString(),
        committed: round(b.committed),
        weighted: round(b.weighted),
        bestCase: round(b.bestCase),
        counts: b.counts,
        byOwner: Array.from(b.byOwner.entries()).map(([oid, a]) => ({
          ownerId: oid === 'unassigned' ? null : oid,
          weighted: round(a.weighted),
          bestCase: round(a.bestCase),
          committed: round(a.committed),
        })),
      };
    });

    const overdue = overdueAgg[0] || { value: 0, count: 0 };

    return NextResponse.json({
      period,
      horizon,
      pipelineId: pipelineId ?? null,
      ownerId: ownerId ?? null,
      generatedAt: now.toISOString(),
      periods: periodsOut,
      overdue: { count: overdue.count || 0, value: round(overdue.value || 0) },
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error building CRM forecast:', error);
    return NextResponse.json({ error: 'Failed to build forecast' }, { status: 500 });
  }
}
