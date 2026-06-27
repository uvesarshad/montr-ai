import { z } from 'zod';
import { tool } from 'ai';
import { AgentContext } from './types';
import { toolRegistry } from '../tool-registry';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';
import { pipelineRepository } from '@/lib/db/repository/crm/pipeline.repository';

/**
 * Create a new CRM deal
 */
export const createDealTool = {
    name: 'createDeal',
    description: 'Create a new CRM deal in the sales pipeline. Use this when a user mentions a new opportunity, sale, or deal.',
    parameters: z.object({
        name: z.string().describe("Name/title of the deal."),
        value: z.number().optional().describe("Monetary value of the deal."),
        contactId: z.string().optional().describe("ID of the associated contact."),
        description: z.string().optional().describe("Notes or description about the deal."),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Create a new CRM deal in the sales pipeline.',
        parameters: z.object({
            name: z.string(),
            value: z.number().optional(),
            contactId: z.string().optional(),
            description: z.string().optional(),
        }),
        execute: async (args) => {
            try {
                console.log(`[Agent Tool - createDeal] Agent ${context.userId} creating deal: ${args.name}`);

                // Get default pipeline
                const pipelines = await pipelineRepository.findAll();
                if (!pipelines || pipelines.length === 0) {
                    return { success: false, error: 'No sales pipeline found. Please create a pipeline in CRM first.' };
                }

                const pipeline = pipelines[0];
                const firstStage = pipeline.stages?.[0];
                if (!firstStage) {
                    return { success: false, error: 'Pipeline has no stages configured.' };
                }

                const deal = await dealRepository.create({
                    name: args.name,
                    description: args.description,
                    value: args.value,
                    contactId: args.contactId,
                    pipelineId: pipeline._id.toString(),
                    stageId: firstStage._id.toString(),
                    status: 'open',
                    createdById: context.userId,
                });

                return {
                    success: true,
                    message: `Deal "${args.name}" created successfully in pipeline "${pipeline.name}".`,
                    dealId: deal._id.toString(),
                    stage: firstStage.name,
                    value: args.value || 0,
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to create deal' };
            }
        }
    })
};

/**
 * Update deal stage (move through pipeline)
 */
export const updateDealStageTool = {
    name: 'updateDealStage',
    description: 'Move a CRM deal to a different stage in the pipeline. Use this to advance or update deal progress.',
    parameters: z.object({
        dealId: z.string().describe("The ID of the deal to update."),
        stageName: z.string().describe("The name of the stage to move the deal to (e.g. 'Negotiation', 'Closed Won')."),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Move a CRM deal to a different pipeline stage.',
        parameters: z.object({
            dealId: z.string(),
            stageName: z.string(),
        }),
        execute: async (args) => {
            try {
                console.log(`[Agent Tool - updateDealStage] Moving deal ${args.dealId} to stage "${args.stageName}"`);

                // Check for won/lost status
                const lowerStage = args.stageName.toLowerCase();
                if (lowerStage.includes('won') || lowerStage === 'closed won') {
                    const _deal = await dealRepository.markAsWon(args.dealId);
                    return { success: true, message: `Deal marked as Won! 🎉`, dealId: args.dealId };
                }
                if (lowerStage.includes('lost') || lowerStage === 'closed lost') {
                    const _deal = await dealRepository.markAsLost(args.dealId);
                    return { success: true, message: `Deal marked as Lost.`, dealId: args.dealId };
                }

                // Find the target stage in the pipeline
                const deal = await dealRepository.findById(args.dealId);
                if (!deal) return { success: false, error: 'Deal not found.' };

                const pipeline = await pipelineRepository.findById(deal.pipelineId.toString());
                if (!pipeline) return { success: false, error: 'Pipeline not found.' };

                const targetStage = pipeline.stages?.find(
                    (s: { name: string }) => s.name.toLowerCase() === lowerStage
                );
                if (!targetStage) {
                    const stageNames = pipeline.stages?.map((s: { name: string }) => s.name).join(', ') || 'none';
                    return { success: false, error: `Stage "${args.stageName}" not found. Available: ${stageNames}` };
                }

                await dealRepository.moveToStage(
                    args.dealId,
                    targetStage._id.toString(), targetStage.name
                );

                return {
                    success: true,
                    message: `Deal moved to "${targetStage.name}" stage.`,
                    dealId: args.dealId,
                    newStage: targetStage.name,
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to update deal stage' };
            }
        }
    })
};

/**
 * Get deals pipeline overview
 */
export const getDealsPipelineTool = {
    name: 'getDealsPipeline',
    description: 'Get an overview of the CRM deals pipeline, including deal counts and values by stage.',
    parameters: z.object({}),
    factory: (context: AgentContext) => tool({
        description: 'Get CRM deals pipeline overview.',
        parameters: z.object({}),
        execute: async () => {
            try {
                console.log(`[Agent Tool - getDealsPipeline] Getting pipeline overview for org ${context.userId}`);

                const stats = await dealRepository.getStats();
                const pipelines = await pipelineRepository.findAll();

                let stageBreakdown: unknown[] = [];
                if (pipelines.length > 0) {
                    stageBreakdown = await dealRepository.getByStageStats(
                        pipelines[0]._id.toString()
                    );
                }

                return {
                    success: true,
                    overview: {
                        totalDeals: stats.total,
                        openDeals: stats.open,
                        wonDeals: stats.won,
                        lostDeals: stats.lost,
                        totalPipelineValue: stats.totalValue,
                        wonValue: stats.wonValue,
                    },
                    stageBreakdown,
                    pipelineName: pipelines[0]?.name || 'Default',
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to get pipeline overview' };
            }
        }
    })
};

/**
 * List deals with optional filters
 */
export const listDealsTool = {
    name: 'listDeals',
    description: 'List CRM deals with optional filters. Use this to survey open opportunities before acting on them.',
    parameters: z.object({
        search: z.string().optional().describe('Search by deal name.'),
        status: z.enum(['open', 'won', 'lost']).optional().describe('Filter by deal status.'),
        limit: z.number().int().min(1).max(50).optional().describe('Max results to return (default 10).'),
    }),
    factory: (context: AgentContext) => tool({
        description: 'List CRM deals with optional filters.',
        parameters: z.object({
            search: z.string().optional(),
            status: z.enum(['open', 'won', 'lost']).optional(),
            limit: z.number().int().min(1).max(50).optional(),
        }),
        execute: async (args) => {
            try {
                const result = await dealRepository.find({
                    search: args.search,
                    status: args.status,
                }, { limit: args.limit ?? 10 });
                const deals = result.data || [];

                return {
                    success: true,
                    total: result.pagination.total,
                    deals: deals.map((d: { _id: { toString(): string }; name: string; value?: number; status?: string; stageName?: string; priority?: string; expectedCloseDate?: Date }) => ({
                        id: d._id.toString(),
                        name: d.name,
                        value: d.value,
                        status: d.status,
                        stage: d.stageName,
                        priority: d.priority,
                        expectedCloseDate: d.expectedCloseDate,
                    })),
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to list deals' };
            }
        },
    }),
};

toolRegistry.register(createDealTool);
toolRegistry.register(updateDealStageTool);
toolRegistry.register(getDealsPipelineTool);
toolRegistry.register(listDealsTool);
