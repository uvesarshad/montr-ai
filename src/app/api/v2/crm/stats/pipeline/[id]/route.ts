import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';
import { pipelineRepository } from '@/lib/db/repository/crm/pipeline.repository';

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    const ctx = await getCrmPermissionContext(userId);
    assertCrmPermission(ctx, 'contact', 'read');
    const pipelineId = params.id;

    // Get user's organization
    // Get pipeline
    const pipeline = await pipelineRepository.findById(pipelineId);
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    // Get all deals for this pipeline
    const allDeals = await dealRepository.find(
      { pipelineId },
      { limit: 10000 }
    );

    // Calculate stats by stage
    const stageStats: Record<string, {
      stageId: string;
      stageName: string;
      order: number;
      count: number;
      value: number;
      totalTimeInStage: number;
      dealsInStage: number;
    }> = {};

    // Initialize all stages
    pipeline.stages.forEach(stage => {
      stageStats[stage._id.toString()] = {
        stageId: stage._id.toString(),
        stageName: stage.name,
        order: stage.order,
        count: 0,
        value: 0,
        totalTimeInStage: 0,
        dealsInStage: 0,
      };
    });

    // Process deals
    allDeals.data.forEach(deal => {
      const currentStageId = deal.stageId.toString();

      // Count open deals per stage
      if (deal.status === 'open' && stageStats[currentStageId]) {
        stageStats[currentStageId].count++;
        stageStats[currentStageId].value += deal.value || 0;
      }

      // Calculate time spent in each stage from stage history
      if (deal.stageHistory && deal.stageHistory.length > 0) {
        deal.stageHistory.forEach(history => {
          const historyStageId = history.stageId.toString();
          if (stageStats[historyStageId]) {
            if (history.exitedAt) {
              const timeInStage = new Date(history.exitedAt).getTime() - new Date(history.enteredAt).getTime();
              stageStats[historyStageId].totalTimeInStage += timeInStage;
              stageStats[historyStageId].dealsInStage++;
            }
          }
        });
      }
    });

    // Calculate conversion rates and format stages
    const stages = Object.values(stageStats)
      .sort((a, b) => a.order - b.order)
      .map((stage, index, array) => {
        const avgTimeInStage = stage.dealsInStage > 0
          ? stage.totalTimeInStage / stage.dealsInStage
          : 0;

        // Convert to days
        const avgTimeInStageDays = Math.round(avgTimeInStage / (1000 * 60 * 60 * 24));

        // Calculate conversion rate to next stage
        let conversionRate = 0;
        if (index < array.length - 1) {
          const currentStageCount = stage.count;
          const nextStageCount = array[index + 1].count;
          if (currentStageCount > 0) {
            conversionRate = (nextStageCount / currentStageCount) * 100;
          }
        }

        return {
          stageId: stage.stageId,
          stageName: stage.stageName,
          order: stage.order,
          dealCount: stage.count,
          totalValue: stage.value,
          avgDealValue: stage.count > 0 ? stage.value / stage.count : 0,
          avgTimeInStage: avgTimeInStageDays,
          conversionRate,
        };
      });

    const response = {
      pipelineId: pipeline._id,
      pipelineName: pipeline.name,
      totalDeals: allDeals.data.filter(d => d.status === 'open').length,
      totalValue: stages.reduce((sum, s) => sum + s.totalValue, 0),
      stages,
    };

    return NextResponse.json(response);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching pipeline funnel stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pipeline stats' },
      { status: 500 }
    );
  }
}
