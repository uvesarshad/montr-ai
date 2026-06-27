/**
 * Create Deal Processor
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import { dealRepository } from '../../../db/repository/crm/deal.repository';

export class CreateDealProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;
    const str = (v: unknown, fallback = ''): string => (v == null ? fallback : String(v));
    const strOrUndef = (v: unknown): string | undefined => (v == null ? undefined : String(v));

    // Get deal data
    const name = str(config.name);
    const pipelineId = str(config.pipelineId);
    const stageId = str(config.stageId);
    const amount = typeof config.amount === 'number' ? config.amount : undefined;
    const contactId = strOrUndef(config.contactId) ?? execution.contactId?.toString();
    const companyId = strOrUndef(config.companyId);
    const ownerId = strOrUndef(config.ownerId) ?? execution.userId.toString();

    if (!name) {
      throw new Error('Deal name is required');
    }

    if (!pipelineId || !stageId) {
      throw new Error('Pipeline ID and Stage ID are required');
    }

    // Create deal
    const deal = await dealRepository.create({
      name,
      pipelineId,
      stageId,
      value: amount,
      contactId: contactId || undefined,
      companyId: companyId || undefined,
      ownerId,
      createdById: execution.userId.toString()
    });

    // Store deal ID in variables
    await execution.updateVariable('deal_id', deal._id.toString());

    return {
      success: true,
      dealId: deal._id.toString(),
      deal: {
        name: deal.name,
        amount: deal.value,
        pipelineId: deal.pipelineId.toString(),
        stageId: deal.stageId.toString()
      }
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!config.name) {
      errors.push('Deal name is required');
    }

    if (!config.pipelineId) {
      errors.push('Pipeline ID is required');
    }

    if (!config.stageId) {
      errors.push('Stage ID is required');
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
