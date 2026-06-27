import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';
import { pipelineRepository } from '@/lib/db/repository/crm/pipeline.repository';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    const ctx = await getCrmPermissionContext(userId);
    assertCrmPermission(ctx, 'contact', 'read');
    // Get all deals
    const allDeals = await dealRepository.find({}, { limit: 10000 });

    // Get all pipelines to calculate stage stats
    const pipelines = await pipelineRepository.findAll();

    // Calculate deal stats by stage
    const dealsByStage: Record<string, { count: number; value: number }> = {};
    const dealsByPriority: Record<string, number> = { low: 0, medium: 0, high: 0, urgent: 0 };
    let totalDealValue = 0;
    let wonDealsCount = 0;
    let wonDealsValue = 0;
    let lostDealsCount = 0;
    let openDealsCount = 0;
    let totalCloseTime = 0;
    let closedDealsWithTime = 0;

    allDeals.data.forEach(deal => {
      // By priority
      dealsByPriority[deal.priority] = (dealsByPriority[deal.priority] || 0) + 1;

      // Total value
      totalDealValue += deal.value || 0;

      // By status
      if (deal.status === 'won') {
        wonDealsCount++;
        wonDealsValue += deal.value || 0;

        // Calculate time to close
        if (deal.actualCloseDate) {
          const closeTime = new Date(deal.actualCloseDate).getTime() - new Date(deal.createdAt).getTime();
          totalCloseTime += closeTime;
          closedDealsWithTime++;
        }
      } else if (deal.status === 'lost') {
        lostDealsCount++;

        // Calculate time in pipeline before lost
        if (deal.actualCloseDate) {
          const closeTime = new Date(deal.actualCloseDate).getTime() - new Date(deal.createdAt).getTime();
          totalCloseTime += closeTime;
          closedDealsWithTime++;
        }
      } else if (deal.status === 'open') {
        openDealsCount++;

        // By stage (only open deals)
        const stageId = deal.stageId.toString();
        if (!dealsByStage[stageId]) {
          dealsByStage[stageId] = { count: 0, value: 0 };
        }
        dealsByStage[stageId].count++;
        dealsByStage[stageId].value += deal.value || 0;
      }
    });

    // Calculate averages
    const avgDealSize = allDeals.data.length > 0 ? totalDealValue / allDeals.data.length : 0;
    const winRate = (wonDealsCount + lostDealsCount) > 0
      ? (wonDealsCount / (wonDealsCount + lostDealsCount)) * 100
      : 0;
    const avgTimeToClose = closedDealsWithTime > 0
      ? totalCloseTime / closedDealsWithTime
      : 0;

    // Convert avg time to close from milliseconds to days
    const avgTimeToCloseDays = Math.round(avgTimeToClose / (1000 * 60 * 60 * 24));

    // Format stage stats with stage names
    const stageStats = await Promise.all(
      Object.entries(dealsByStage).map(async ([stageId, stats]) => {
        // Find stage name from pipelines
        let stageName = 'Unknown';
        for (const pipeline of pipelines) {
          const stage = pipeline.stages.find(s => s._id.toString() === stageId);
          if (stage) {
            stageName = stage.name;
            break;
          }
        }

        return {
          stageId,
          stageName,
          count: stats.count,
          value: stats.value,
        };
      })
    );

    const response = {
      total: allDeals.pagination.total,
      open: openDealsCount,
      won: wonDealsCount,
      lost: lostDealsCount,
      totalValue: totalDealValue,
      wonValue: wonDealsValue,
      avgDealSize,
      winRate,
      avgTimeToCloseDays,
      byStage: stageStats,
      byPriority: dealsByPriority,
    };

    return NextResponse.json(response);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching deal stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deal stats' },
      { status: 500 }
    );
  }
}
