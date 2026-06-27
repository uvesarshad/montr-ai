import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';
import { pipelineRepository } from '@/lib/db/repository/crm/pipeline.repository';
import type { ICrmDeal } from '@/lib/db/models/crm/deal.model';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';

/**
 * GET /api/v2/crm/deals/kanban
 * Get deals grouped by stage for kanban view
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const ctx = await getCrmPermissionContext(userId);
    const { scope } = assertCrmPermission(ctx, 'deal', 'read');

    const { searchParams } = new URL(request.url);

    // Get pipeline ID from query params (required)
    const pipelineId = searchParams.get('pipelineId');
    if (!pipelineId) {
      return NextResponse.json(
        { error: 'pipelineId is required' },
        { status: 400 }
      );
    }

    // Get pipeline
    const pipeline = await pipelineRepository.findById(pipelineId);
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    // Parse optional filters
    const filters: Record<string, unknown> = {
      pipelineId,
      status: 'open', // Only show open deals in kanban
    };

    const search = searchParams.get('search');
    if (search) {
      filters.search = search;
    }

    const ownerId = searchParams.get('ownerId');
    if (ownerId) {
      filters.ownerId = ownerId;
    }

    if (scope === 'own') {
      filters.ownerId = userId;
    }

    const priority = searchParams.get('priority');
    if (priority) {
      filters.priority = priority;
    }

    const tags = searchParams.get('tags');
    if (tags) {
      filters.tags = tags.split(',');
    }

    // Get all open deals for this pipeline
    const result = await dealRepository.find(filters, {
      page: 1,
      limit: 1000, // Get all deals for kanban
      sort: 'createdAt',
      sortDirection: 'desc',
    });

    // Group deals by stage
    const stageMap = new Map<string, ICrmDeal[]>();

    // Initialize all stages with empty arrays
    for (const stage of pipeline.stages) {
      stageMap.set(stage._id.toString(), []);
    }

    // Group deals by their stage
    for (const deal of result.data) {
      const stageId = deal.stageId.toString();
      if (stageMap.has(stageId)) {
        stageMap.get(stageId)!.push(deal);
      }
    }

    // Build response with stage metadata
    const stages = pipeline.stages
      .sort((a, b) => a.order - b.order)
      .map(stage => {
        const deals = stageMap.get(stage._id.toString()) || [];
        const totalValue = deals.reduce((sum, deal) => sum + (deal.value || 0), 0);

        return {
          stage: {
            _id: stage._id,
            name: stage.name,
            order: stage.order,
            probability: stage.probability,
            color: stage.color,
            type: stage.type,
          },
          deals,
          totalValue,
          dealCount: deals.length,
        };
      });

    return NextResponse.json({
      pipeline: {
        _id: pipeline._id,
        name: pipeline.name,
        description: pipeline.description,
        currency: pipeline.currency,
        stages: pipeline.stages,
      },
      stages,
      totalDeals: result.data.length,
      totalValue: result.data.reduce((sum, deal) => sum + (deal.value || 0), 0),
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching kanban data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch kanban data', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
