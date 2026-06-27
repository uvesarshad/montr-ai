/**
 * Update Deal Processor
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { dealRepository } from '../../../db/repository/crm/deal.repository';

export class UpdateDealProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    // Get deal ID
    const dealId = config.dealId ? String(config.dealId) : execution.dealId?.toString();

    if (!dealId) {
      throw new Error('Deal ID is required');
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    if (config.name !== undefined) updateData.name = config.name;
    if (config.amount !== undefined) updateData.value = config.amount;
    if (config.stageId !== undefined) updateData.stageId = config.stageId;
    if (config.status !== undefined) updateData.status = config.status;
    if (config.ownerId !== undefined) updateData.ownerId = config.ownerId;
    if (config.closedAt !== undefined) updateData.closedAt = config.closedAt;

    // Update deal
    const deal = await dealRepository.update(
      dealId,
      updateData
    );

    if (!deal) {
      throw new Error(`Deal not found: ${dealId}`);
    }

    return {
      success: true,
      dealId: deal._id.toString(),
      updated: Object.keys(updateData),
      deal: {
        name: deal.name,
        amount: deal.value,
        stageId: deal.stageId.toString(),
        status: deal.status
      }
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!config.dealId) {
      errors.push('Deal ID is required');
    }

    if (config.amount !== undefined && typeof config.amount !== 'number') {
      errors.push('Amount must be a number');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}
