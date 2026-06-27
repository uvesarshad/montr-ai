import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';
import { pipelineRepository } from '@/lib/db/repository/crm/pipeline.repository';
import { moveDealStageSchema } from '@/validations/crm/deal.schema';
import { emitDealStageChanged } from '@/lib/crm';
import { getCrmPermissionContext, assertCrmPermission, ownsRecord, crmErrorResponse, CrmPermissionError } from '@/lib/crm/permissions';
import { z } from 'zod';

/**
 * PATCH /api/v2/crm/deals/[id]/stage
 * Move a deal to a different stage
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
    const dealId = params.id;

    const ctx = await getCrmPermissionContext(userId);
    const { scope } = assertCrmPermission(ctx, 'deal', 'update');

    const body = await request.json();

    // Validate input
    const validatedData = moveDealStageSchema.parse(body);

    // Check if deal exists
    const deal = await dealRepository.findById(dealId);
    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }

    if (scope === 'own' && !ownsRecord(ctx, 'deal', deal as unknown as Record<string, unknown>)) {
      throw new CrmPermissionError('No permission to update this deal');
    }

    // Get pipeline to find stage name
    const pipeline = await pipelineRepository.findById(
      deal.pipelineId.toString()
    );
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    // Verify new stage exists in pipeline
    const newStage = pipeline.stages.find(s => s._id.toString() === validatedData.stageId);
    if (!newStage) {
      return NextResponse.json(
        { error: 'Stage not found in pipeline' },
        { status: 404 }
      );
    }

    // Move deal to new stage
    const updatedDeal = await dealRepository.moveToStage(
      dealId,
      validatedData.stageId,
      newStage.name
    );

    // Update probability if provided, otherwise use stage's default probability
    const probability = validatedData.probability !== undefined
      ? validatedData.probability
      : newStage.probability;

    if (updatedDeal) {
      await dealRepository.update(dealId, { probability });
    }

    if (updatedDeal) {
      const previousStageId = String(deal.stageId ?? '');
      await emitDealStageChanged(updatedDeal, previousStageId, userId);
    }

    return NextResponse.json(updatedDeal);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error moving deal to stage:', error);
    return NextResponse.json(
      { error: 'Failed to move deal to stage', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
