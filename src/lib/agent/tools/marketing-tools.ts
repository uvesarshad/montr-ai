/**
 * Marketing Roadmap Tools
 *
 * 8 tools that give the Copilot agency over the Marketing Roadmap:
 * - getRoadmapTasks, completeRoadmapTask, addRoadmapTask
 * - executeRoadmapTask (HITL-gated)
 * - getCrossChannelReport, getEmailCampaignMetrics, getWhatsAppCampaignMetrics
 * - iterateMarketingPlan (HITL-gated)
 */

import { z } from 'zod';
import { tool } from 'ai';
import { AgentContext } from './types';
import { toolRegistry } from '../tool-registry';
import MarketingPlan, { IMarketingTask } from '@/lib/db/models/marketing-plan.model';
import { CrossChannelAnalyticsService } from '@/lib/services/cross-channel-analytics';
import { dbConnect } from '@/lib/db/connect';

// ── 1. getRoadmapTasks ─────────────────────────────────────

const getRoadmapTasksTool = {
    name: 'getRoadmapTasks',
    description: 'Get the current marketing roadmap tasks for the active brand. Returns pending and completed tasks with XP info.',
    parameters: z.object({
        statusFilter: z.enum(['all', 'pending', 'completed']).optional().describe('Filter tasks by status (default: all).'),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Get marketing roadmap tasks.',
        parameters: z.object({
            statusFilter: z.enum(['all', 'pending', 'completed']).optional(),
        }),
        execute: async (args) => {
            try {
                await dbConnect();
                const plan = await MarketingPlan.findOne({
                    userId: context.userId,
                    brandId: context.brandId,
                }).lean();

                if (!plan || !plan.tasks?.length) {
                    return {
                        success: true,
                        message: 'No active marketing roadmap found. The user should complete onboarding first.',
                        tasks: [],
                        level: 1,
                        xp: 0,
                    };
                }

                let tasks = plan.tasks;
                if (args.statusFilter && args.statusFilter !== 'all') {
                    tasks = tasks.filter((t: IMarketingTask) => t.status === args.statusFilter);
                }

                const pending = plan.tasks.filter((t: IMarketingTask) => t.status !== 'completed').length;
                const completed = plan.tasks.filter((t: IMarketingTask) => t.status === 'completed').length;

                return {
                    success: true,
                    level: plan.currentLevel,
                    xp: plan.currentXp,
                    totalTasks: plan.tasks.length,
                    pendingCount: pending,
                    completedCount: completed,
                    tasks: tasks.map((t: IMarketingTask) => ({
                        id: t.id,
                        title: t.title,
                        description: t.description,
                        status: t.status,
                        type: t.type,
                        difficulty: t.difficulty,
                        xpReward: t.xpReward,
                        dueDate: t.dueDate,
                    })),
                    message: `Roadmap: Level ${plan.currentLevel} (${plan.currentXp} XP) — ${pending} pending, ${completed} completed.`,
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to fetch roadmap tasks' };
            }
        },
    }),
};

// ── 2. completeRoadmapTask ─────────────────────────────────

const completeRoadmapTaskTool = {
    name: 'completeRoadmapTask',
    description: 'Mark a marketing roadmap task as completed and award XP. Use when the user says they have finished a task.',
    parameters: z.object({
        taskId: z.string().describe('The task ID to mark as completed.'),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Complete a roadmap task.',
        parameters: z.object({
            taskId: z.string(),
        }),
        execute: async (args) => {
            try {
                await dbConnect();
                const plan = await MarketingPlan.findOne({
                    userId: context.userId,
                    brandId: context.brandId,
                });

                if (!plan) {
                    return { success: false, error: 'No marketing plan found.' };
                }

                const task = plan.tasks.find((t: IMarketingTask) => t.id === args.taskId);
                if (!task) {
                    return { success: false, error: `Task "${args.taskId}" not found.` };
                }

                if (task.status === 'completed') {
                    return { success: true, message: `Task "${task.title}" is already completed.` };
                }

                // Award XP and check level up
                task.status = 'completed';
                plan.currentXp += task.xpReward || 10;
                const xpForNextLevel = plan.currentLevel * 100;
                if (plan.currentXp >= xpForNextLevel) {
                    plan.currentLevel += 1;
                    plan.currentXp -= xpForNextLevel;
                }

                await plan.save();

                return {
                    success: true,
                    message: `✅ Task "${task.title}" completed! +${task.xpReward} XP. Now Level ${plan.currentLevel} (${plan.currentXp} XP).`,
                    taskId: task.id,
                    taskTitle: task.title,
                    xpEarned: task.xpReward,
                    newLevel: plan.currentLevel,
                    newXp: plan.currentXp,
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to complete task' };
            }
        },
    }),
};

// ── 3. addRoadmapTask ──────────────────────────────────────

const addRoadmapTaskTool = {
    name: 'addRoadmapTask',
    description: 'Add a new task to the marketing roadmap. Use when suggesting new actions for the user.',
    parameters: z.object({
        title: z.string().describe('Short task title.'),
        description: z.string().describe('Detailed description of what to do.'),
        type: z.enum(['content', 'strategy', 'research', 'outreach', 'campaign', 'automation', 'other']).describe('Task category.'),
        difficulty: z.enum(['easy', 'medium', 'hard']).describe('Task difficulty level.'),
        xpReward: z.number().optional().describe('XP reward (default: 10 easy, 20 medium, 50 hard).'),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Add a task to the marketing roadmap.',
        parameters: z.object({
            title: z.string(),
            description: z.string(),
            type: z.enum(['content', 'strategy', 'research', 'outreach', 'campaign', 'automation', 'other']),
            difficulty: z.enum(['easy', 'medium', 'hard']),
            xpReward: z.number().optional(),
        }),
        execute: async (args) => {
            try {
                await dbConnect();
                const plan = await MarketingPlan.findOne({
                    userId: context.userId,
                    brandId: context.brandId,
                });

                if (!plan) {
                    return { success: false, error: 'No marketing plan found. Complete onboarding first.' };
                }

                const defaultXp = args.difficulty === 'easy' ? 10 : args.difficulty === 'medium' ? 20 : 50;

                const newTask: IMarketingTask = {
                    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    title: args.title,
                    description: args.description,
                    status: 'pending',
                    type: args.type as IMarketingTask['type'],
                    difficulty: args.difficulty,
                    xpReward: args.xpReward || defaultXp,
                    dueDate: new Date(Date.now() + 7 * 86400000), // 1 week from now
                };

                plan.tasks.push(newTask);
                await plan.save();

                return {
                    success: true,
                    message: `📋 Added task: "${args.title}" (${args.difficulty}, +${newTask.xpReward} XP).`,
                    taskId: newTask.id,
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to add task' };
            }
        },
    }),
};

// ── 4. executeRoadmapTask ──────────────────────────────────

const executeRoadmapTaskTool = {
    name: 'executeRoadmapTask',
    description: 'Execute a marketing roadmap task by triggering the appropriate action. This will create posts, contacts, or other assets. Requires user approval. Use when the user asks you to execute or work on a task.',
    parameters: z.object({
        taskId: z.string().describe('The task ID to execute.'),
        executionNotes: z.string().optional().describe('Additional context for how to execute the task.'),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Execute a roadmap task (requires approval).',
        parameters: z.object({
            taskId: z.string(),
            executionNotes: z.string().optional(),
        }),
        execute: async (args) => {
            try {
                await dbConnect();
                const plan = await MarketingPlan.findOne({
                    userId: context.userId,
                    brandId: context.brandId,
                });

                if (!plan) {
                    return { success: false, error: 'No marketing plan found.' };
                }

                const task = plan.tasks.find((t: IMarketingTask) => t.id === args.taskId);
                if (!task) {
                    return { success: false, error: `Task "${args.taskId}" not found.` };
                }

                if (task.status === 'completed') {
                    return { success: true, message: `Task "${task.title}" is already completed.` };
                }

                // Map task type to execution strategy
                const strategy = mapTaskToStrategy(task);

                // Mark as in_progress
                task.status = 'in_progress';
                await plan.save();

                return {
                    success: true,
                    message: `🚀 Task execution plan for "${task.title}":\n\n${strategy.description}\n\nPlease tell me to proceed with each step, or I'll execute them with your approval.`,
                    taskId: task.id,
                    taskTitle: task.title,
                    strategy: strategy,
                    requiresApproval: strategy.requiresApproval,
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to execute task' };
            }
        },
    }),
};

function mapTaskToStrategy(task: IMarketingTask) {
    const strategies: Record<string, { description: string; suggestedTools: string[]; requiresApproval: boolean }> = {
        content: {
            description: `**Content Task**: I'll draft a social media post based on: "${task.description}". After your approval, I'll save it to your Drafts for scheduling.`,
            suggestedTools: ['schedulePost'],
            requiresApproval: true,
        },
        strategy: {
            description: `**Strategy Task**: I'll analyze your cross-channel performance and provide strategic recommendations for: "${task.description}".`,
            suggestedTools: ['getCrossChannelReport', 'searchKnowledgeBase'],
            requiresApproval: false,
        },
        research: {
            description: `**Research Task**: I'll search your knowledge base and analytics for insights on: "${task.description}".`,
            suggestedTools: ['searchKnowledgeBase', 'getCrossChannelReport'],
            requiresApproval: false,
        },
        outreach: {
            description: `**Outreach Task**: I'll help create contacts or draft messages for: "${task.description}". Each action requires your approval.`,
            suggestedTools: ['createContact'],
            requiresApproval: true,
        },
        campaign: {
            description: `**Campaign Task**: I'll help set up a campaign for: "${task.description}". Campaign creation requires your approval.`,
            suggestedTools: ['schedulePost'],
            requiresApproval: true,
        },
        automation: {
            description: `**Automation Task**: I'll help trigger or set up workflows for: "${task.description}". Workflow triggers require your approval.`,
            suggestedTools: ['triggerWorkflow'],
            requiresApproval: true,
        },
        other: {
            description: `**Task**: "${task.description}". I'll help you work through this step by step.`,
            suggestedTools: [],
            requiresApproval: false,
        },
    };

    return strategies[task.type] || strategies.other;
}

// ── 5. getCrossChannelReport ───────────────────────────────

const getCrossChannelReportTool = {
    name: 'getCrossChannelReport',
    description: 'Get a unified performance report across Social, Email, and WhatsApp channels. Use when analyzing overall marketing performance or before iterating the plan.',
    parameters: z.object({
        period: z.enum(['7d', '30d', '90d']).optional().describe('Time period (default: 30d).'),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Get cross-channel analytics report.',
        parameters: z.object({
            period: z.enum(['7d', '30d', '90d']).optional(),
        }),
        execute: async (args) => {
            try {
                const report = await CrossChannelAnalyticsService.getReport(
                    context.brandId || '',
                    context.userId,
                    args.period || '30d',
                );

                return {
                    success: true,
                    report,
                    message: report.summary,
                    deepLink: '/social/analytics',
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to get cross-channel report' };
            }
        },
    }),
};

// ── 6. getEmailCampaignMetrics ─────────────────────────────

const getEmailCampaignMetricsTool = {
    name: 'getEmailCampaignMetrics',
    description: 'Get email campaign performance metrics (open rate, click rate, bounces). Use when the user asks about email marketing results.',
    parameters: z.object({
        period: z.enum(['7d', '30d', '90d']).optional().describe('Time period (default: 30d).'),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Get email campaign metrics.',
        parameters: z.object({
            period: z.enum(['7d', '30d', '90d']).optional(),
        }),
        execute: async (args) => {
            try {
                const report = await CrossChannelAnalyticsService.getReport(
                    context.brandId || '',
                    context.userId,
                    args.period || '30d',
                );

                const email = report.email;
                return {
                    success: true,
                    metrics: email,
                    message: email.campaignsSent > 0
                        ? `Email (last ${args.period || '30d'}): ${email.campaignsSent} campaigns, ${email.avgOpenRate}% open rate, ${email.avgClickRate}% click rate, ${email.totalBounced} bounces.`
                        : 'No email campaigns completed in this period.',
                    deepLink: '/marketing/email',
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to get email metrics' };
            }
        },
    }),
};

// ── 7. getWhatsAppCampaignMetrics ──────────────────────────

const getWhatsAppCampaignMetricsTool = {
    name: 'getWhatsAppCampaignMetrics',
    description: 'Get WhatsApp campaign performance metrics (delivery rate, read rate). Use when the user asks about WhatsApp campaign results.',
    parameters: z.object({
        period: z.enum(['7d', '30d', '90d']).optional().describe('Time period (default: 30d).'),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Get WhatsApp campaign metrics.',
        parameters: z.object({
            period: z.enum(['7d', '30d', '90d']).optional(),
        }),
        execute: async (args) => {
            try {
                const report = await CrossChannelAnalyticsService.getReport(
                    context.brandId || '',
                    context.userId,
                    args.period || '30d',
                );

                const wa = report.whatsapp;
                return {
                    success: true,
                    metrics: wa,
                    message: wa.campaignsSent > 0
                        ? `WhatsApp (last ${args.period || '30d'}): ${wa.campaignsSent} campaigns, ${wa.deliveryRate}% delivered, ${wa.readRate}% read.`
                        : 'No WhatsApp campaigns in this period.',
                    deepLink: '/marketing/whatsapp',
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to get WhatsApp metrics' };
            }
        },
    }),
};

// ── 8. iterateMarketingPlan ────────────────────────────────

const iterateMarketingPlanTool = {
    name: 'iterateMarketingPlan',
    description: 'Iterate and improve the marketing plan based on cross-channel performance data. Generates updated tasks and strategy adjustments. Requires user approval before applying changes.',
    parameters: z.object({
        feedback: z.string().optional().describe('Optional user feedback or specific areas to focus on.'),
        period: z.enum(['7d', '30d', '90d']).optional().describe('Analytics period to consider (default: 30d).'),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Iterate marketing plan based on analytics.',
        parameters: z.object({
            feedback: z.string().optional(),
            period: z.enum(['7d', '30d', '90d']).optional(),
        }),
        execute: async (args) => {
            try {
                await dbConnect();
                const plan = await MarketingPlan.findOne({
                    userId: context.userId,
                    brandId: context.brandId,
                });

                if (!plan) {
                    return { success: false, error: 'No marketing plan found. Complete onboarding first.' };
                }

                // Gather cross-channel data
                const report = await CrossChannelAnalyticsService.getReport(
                    context.brandId || '',
                    context.userId,
                    args.period || '30d',
                );

                // Build the iteration context
                const pendingTasks = plan.tasks
                    .filter((t: IMarketingTask) => t.status !== 'completed')
                    .map((t: IMarketingTask) => `- [${t.status}] ${t.title} (${t.type}): ${t.description}`)
                    .join('\n');

                const completedTasks = plan.tasks
                    .filter((t: IMarketingTask) => t.status === 'completed')
                    .map((t: IMarketingTask) => `- ✅ ${t.title}`)
                    .join('\n');

                const iterationContext = [
                    `**Business**: ${plan.businessName || 'Unknown'} (${plan.businessType || 'Unknown'})`,
                    `**Audience**: ${plan.targetAudience || 'Unknown'}`,
                    `**Goals**: ${plan.goals?.join(', ') || 'Unknown'}`,
                    `**Level**: ${plan.currentLevel} (${plan.currentXp} XP)`,
                    '',
                    '**Pending Tasks:**',
                    pendingTasks || 'None',
                    '',
                    '**Completed Tasks:**',
                    completedTasks || 'None',
                    '',
                    '**Cross-Channel Performance:**',
                    report.summary,
                    '',
                    args.feedback ? `**User Feedback:** ${args.feedback}` : '',
                ].filter(Boolean).join('\n');

                return {
                    success: true,
                    message: `📊 Plan iteration analysis ready. Here's what the data shows:\n\n${report.summary}\n\nBased on this performance data, I recommend adjusting your roadmap. Would you like me to:\n1. **Add new tasks** based on what's working well\n2. **Remove or replace** underperforming task types\n3. **Shift focus** to channels showing better ROI\n4. **Apply all suggested changes** at once\n\nTell me how you'd like to proceed, or give me specific feedback.`,
                    iterationContext,
                    analyticsReport: report,
                    currentPlan: {
                        pendingCount: plan.tasks.filter((t: IMarketingTask) => t.status !== 'completed').length,
                        completedCount: plan.tasks.filter((t: IMarketingTask) => t.status === 'completed').length,
                        level: plan.currentLevel,
                    },
                };
            } catch (error: unknown) {
                return { success: false, error: error instanceof Error ? error.message : 'Failed to iterate marketing plan' };
            }
        },
    }),
};

// ── Register All Tools ─────────────────────────────────────

toolRegistry.register(getRoadmapTasksTool);
toolRegistry.register(completeRoadmapTaskTool);
toolRegistry.register(addRoadmapTaskTool);
toolRegistry.register(executeRoadmapTaskTool);
toolRegistry.register(getCrossChannelReportTool);
toolRegistry.register(getEmailCampaignMetricsTool);
toolRegistry.register(getWhatsAppCampaignMetricsTool);
toolRegistry.register(iterateMarketingPlanTool);

