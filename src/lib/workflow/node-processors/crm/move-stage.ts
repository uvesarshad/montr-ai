/**
 * Move Deal Stage Processor
 *
 * Moves a deal to a different pipeline stage using the deal repository's
 * `moveToStage`, which records a stage-history transition (entered/exited)
 * — the canonical path used by the v2 deals/[id]/stage route. The stage name
 * is resolved from the pipeline so history entries are human-readable.
 *
 * `dealId` defaults to the triggering record when omitted. On a real stage
 * change it fires `deal.stage_changed` (errors swallowed).
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { dealRepository } from '../../../db/repository/crm/deal.repository';
import { pipelineRepository } from '../../../db/repository/crm/pipeline.repository';
import { triggerRecordId } from './crm-helpers';

export class MoveStageProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;
    const userId = execution.userId?.toString();

    const dealId =
      (config.dealId ? String(config.dealId) : undefined) ??
      execution.dealId?.toString() ??
      triggerRecordId(execution);
    if (!dealId) throw new Error('Deal ID is required');

    const stageId = config.stageId ? String(config.stageId) : undefined;
    if (!stageId) throw new Error('Stage ID is required');

    const before = await dealRepository.findById(dealId);
    if (!before) throw new Error(`Deal not found: ${dealId}`);

    const previousStageId = before.stageId?.toString();
    if (previousStageId === stageId) {
      return { success: true, dealId, stageId, previousStageId, changed: false };
    }

    // Resolve the stage name from the deal's pipeline (or an override pipelineId)
    // so the recorded stage-history entry is readable.
    const pipelineId = (config.pipelineId ? String(config.pipelineId) : undefined) ?? before.pipelineId?.toString();
    let stageName = '';
    if (pipelineId) {
      const pipeline = await pipelineRepository.findById(pipelineId);
      const stage = pipeline?.stages.find(s => s._id.toString() === stageId);
      if (pipeline && !stage) {
        throw new Error(`Stage ${stageId} not found in pipeline ${pipelineId}`);
      }
      stageName = stage?.name ?? '';
    }

    const updated = await dealRepository.moveToStage(dealId, stageId, stageName);
    if (!updated) throw new Error(`Failed to update deal ${dealId}`);

    try {
      const { emitDealStageChanged } = await import('@/lib/crm');
      await emitDealStageChanged(updated, previousStageId ?? '', userId);
    } catch (err) {
      console.error('[move_stage] stage_changed emit failed:', err instanceof Error ? err.message : err);
    }

    return { success: true, dealId, stageId, stageName, previousStageId, changed: true };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!config.stageId) errors.push('Stage ID is required');
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}
