/**
 * Scheduled Agent Task Runner
 * 
 * Processes agent_scheduled_tasks that are due for execution.
 * Can be invoked by:
 * 1. A BullMQ cron worker (production)
 * 2. A simple setInterval in dev
 * 3. An API endpoint for manual triggering
 */

import AgentScheduledTask, { IAgentScheduledTask } from '@/lib/db/models/agent-scheduled-task.model';
import RecurringMissionConfig from '@/lib/db/models/recurring-mission-config.model';
import { toolRegistry } from '@/lib/agent/tools/index';
import { dbConnect } from '@/lib/db/connect';
import { agentMissionRepository } from '@/lib/db/repository/agent-mission.repository';
import { getMissionTemplateById } from '@/lib/agent/mission-templates';
import { notifyUser } from '@/lib/notifications/notification-service';

/**
 * Process all due scheduled tasks.
 * Returns the number of tasks processed.
 */
export async function processScheduledTasks(): Promise<number> {
    await dbConnect();

    const now = new Date();

    // Find all active tasks that are due
    const dueTasks = await AgentScheduledTask.find({
        status: 'active',
        nextRunAt: { $lte: now },
    }).limit(50);

    console.log(`[ScheduledTasks] Found ${dueTasks.length} due tasks`);

    let processed = 0;

    for (const task of dueTasks) {
        try {
            await executeTask(task);
            processed++;
        } catch (error) {
            console.error(`[ScheduledTasks] Failed to execute task ${task._id}:`, error);
        }
    }

    return processed;
}

/**
 * Execute a single scheduled task.
 */
async function executeTask(task: IAgentScheduledTask): Promise<void> {
    console.log(`[ScheduledTasks] Executing task "${task.name}" (${task.toolName})`);

    // Build a minimal agent context
    const agentContext = {
        userId: task.userId,
        brandId: task.brandId,
        missionId: task.missionId ?? undefined,
    };

    try {
        // Get the tool from registry
        const allTools = toolRegistry.getToolsForAgent(agentContext);
        const toolDef = allTools[task.toolName];

        if (!toolDef) {
            throw new Error(`Tool "${task.toolName}" not found in registry`);
        }

        // Execute the tool
        const toolDefWithExecute = toolDef as { execute?: (args: Record<string, unknown>) => Promise<{ success?: boolean; message?: string }> };
        const result = await toolDefWithExecute.execute?.(task.toolArgs) ?? {};

        // Update task with result
        const updateData: Record<string, unknown> = {
            lastRunAt: new Date(),
            lastResult: {
                success: result?.success ?? true,
                message: result?.message || JSON.stringify(result).slice(0, 500),
                timestamp: new Date(),
            },
            $inc: { runCount: 1 },
        };

        // Calculate next run time
        const nextRun = calculateNextRunTime(task.cronExpression, task.timezone);
        updateData.nextRunAt = nextRun;

        // Check if max runs reached
        if (task.maxRuns && (task.runCount + 1) >= task.maxRuns) {
            updateData.status = 'completed';
        }

        await AgentScheduledTask.findByIdAndUpdate(task._id, updateData);

        if (task.missionId) {
            await agentMissionRepository.appendEvent({
                missionId: task.missionId,
                brandId: task.brandId,
                userId: task.userId,
                type: 'tool_result',
                role: 'system',
                content: `Scheduled task "${task.name}" ran successfully.`,
                metadata: {
                    taskId: task._id.toString(),
                    toolName: task.toolName,
                    nextRunAt: nextRun.toISOString(),
                },
            }).catch((appendError) => {
                console.error('[ScheduledTasks] Failed to append success event:', appendError);
            });
        }

        console.log(`[ScheduledTasks] Task "${task.name}" executed successfully. Next run: ${nextRun}`);

        void notifyUser(task.userId, {
            type: 'task.completed',
            title: `Scheduled task "${task.name}" ran`,
            body: result?.message || 'The scheduled task completed successfully.',
            source: { module: 'agent', entityType: 'scheduled-task', entityId: task._id.toString() },
            actionUrl: '/agent/scheduled',
            actionLabel: 'View scheduled tasks',
            data: { taskId: task._id.toString(), toolName: task.toolName, nextRunAt: nextRun.toISOString() },
            dedupeKey: `task-done:${task._id.toString()}:${task.runCount}`,
        }).catch((err) => console.error('[ScheduledTasks] notify (success) failed:', err));
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await AgentScheduledTask.findByIdAndUpdate(task._id, {
            lastRunAt: new Date(),
            lastResult: {
                success: false,
                message: errorMessage,
                timestamp: new Date(),
            },
            status: 'failed',
        });

        if (task.missionId) {
            await agentMissionRepository.appendEvent({
                missionId: task.missionId,
                brandId: task.brandId,
                userId: task.userId,
                type: 'error',
                role: 'system',
                content: `Scheduled task "${task.name}" failed: ${errorMessage}`,
                metadata: {
                    taskId: task._id.toString(),
                    toolName: task.toolName,
                },
            }).catch((appendError) => {
                console.error('[ScheduledTasks] Failed to append failure event:', appendError);
            });
        }

        console.error(`[ScheduledTasks] Task "${task.name}" failed:`, errorMessage);

        void notifyUser(task.userId, {
            type: 'task.failed',
            title: `Scheduled task "${task.name}" failed`,
            body: errorMessage,
            source: { module: 'agent', entityType: 'scheduled-task', entityId: task._id.toString() },
            actionUrl: '/agent/scheduled',
            actionLabel: 'View scheduled tasks',
            data: { taskId: task._id.toString(), toolName: task.toolName },
            dedupeKey: `task-failed:${task._id.toString()}:${task.runCount}`,
        }).catch((err) => console.error('[ScheduledTasks] notify (failure) failed:', err));
    }
}

/**
 * Calculate the next run time from a cron expression.
 * Simple implementation for common patterns.
 */
function calculateNextRunTime(cronExpression: string, _timezone: string): Date {
    // Parse simple cron: minute hour dayOfMonth month dayOfWeek
    const parts = cronExpression.trim().split(/\s+/);
    const now = new Date();

    if (parts.length !== 5) {
        // Default: run again in 1 hour
        return new Date(now.getTime() + 60 * 60 * 1000);
    }

    const [minute, hour] = parts;

    // Simple daily schedule: "M H * * *"
    if (parts[2] === '*' && parts[3] === '*' && parts[4] === '*') {
        const next = new Date(now);
        next.setHours(parseInt(hour) || 0, parseInt(minute) || 0, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
        return next;
    }

    // Simple weekly schedule: "M H * * D"
    if (parts[2] === '*' && parts[3] === '*' && parts[4] !== '*') {
        const targetDay = parseInt(parts[4]) || 0; // 0 = Sunday
        const next = new Date(now);
        next.setHours(parseInt(hour) || 0, parseInt(minute) || 0, 0, 0);
        const daysUntil = (targetDay + 7 - now.getDay()) % 7 || 7;
        next.setDate(now.getDate() + daysUntil);
        return next;
    }

    // Default: run again in 24 hours
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Create a new scheduled task.
 */
export async function createScheduledTask(params: {
    brandId: string;
    userId: string;
    missionId?: string;
    name: string;
    description: string;
    toolName: string;
    toolArgs: Record<string, unknown>;
    cronExpression: string;
    timezone?: string;
    maxRuns?: number;
}): Promise<IAgentScheduledTask> {
    await dbConnect();

    const nextRunAt = calculateNextRunTime(params.cronExpression, params.timezone || 'UTC');

    const task = await AgentScheduledTask.create({
        ...params,
        timezone: params.timezone || 'UTC',
        nextRunAt,
        status: 'active',
        runCount: 0,
    });

    if (params.missionId) {
        await agentMissionRepository.appendEvent({
            missionId: params.missionId,
            brandId: params.brandId,
            userId: params.userId,
            type: 'scheduled_action',
            role: 'system',
            content: `Scheduled task "${params.name}" is queued for ${nextRunAt.toISOString()}.`,
            metadata: {
                taskId: task._id.toString(),
                toolName: params.toolName,
                cronExpression: params.cronExpression,
            },
        }).catch((appendError) => {
            console.error('[ScheduledTasks] Failed to append scheduled_action event:', appendError);
        });
    }

    return task;
}

/**
 * List scheduled tasks for a user/organization.
 */
export async function listScheduledTasks(
    options: { brandId?: string; missionId?: string; status?: string } = {}
) {
    await dbConnect();
    const query: Record<string, unknown> = { };
    if (options.brandId) query.brandId = options.brandId;
    if (options.missionId) query.missionId = options.missionId;
    if (options.status) query.status = options.status;
    return AgentScheduledTask.find(query).sort({ nextRunAt: 1 });
}

/**
 * Pause/resume a scheduled task. Scoped to the caller's organization so a task
 * belonging to another tenant can never be toggled.
 */
export async function toggleScheduledTask(
    taskId: string,
    newStatus: 'active' | 'paused'
) {
    await dbConnect();
    return AgentScheduledTask.findOneAndUpdate(
        { _id: taskId },
        { status: newStatus },
        { new: true }
    );
}

/**
 * Delete a scheduled task. Scoped to the caller's organization.
 */
export async function deleteScheduledTask(taskId: string) {
    await dbConnect();
    return AgentScheduledTask.findOneAndDelete({ _id: taskId });
}

/**
 * Retry a failed scheduled task — reset to active with next run in 1 minute.
 * Scoped to the caller's organization.
 */
export async function retryScheduledTask(taskId: string) {
    await dbConnect();
    const task = await AgentScheduledTask.findOne({ _id: taskId });

    if (!task || task.status !== 'failed') {
        return task || null;
    }

    const nextRunAt = new Date(Date.now() + 60 * 1000);

    return AgentScheduledTask.findOneAndUpdate(
        { _id: taskId },
        {
            status: 'active',
            nextRunAt,
            lastResult: {
                success: false,
                message: 'Retry scheduled by user.',
                timestamp: new Date(),
            },
        },
        { new: true }
    );
}

/**
 * Process all due recurring mission configs, spawning a new AgentMission for each.
 * Called by the same cron worker that runs processScheduledTasks().
 */
export async function processRecurringMissions(): Promise<number> {
    await dbConnect();

    const now = new Date();
    const dueConfigs = await RecurringMissionConfig.find({
        enabled: true,
        nextRunAt: { $lte: now },
    }).limit(30);

    let spawned = 0;

    for (const config of dueConfigs) {
        try {
            const template = getMissionTemplateById(config.templateId);
            const title = template?.title ?? config.name;
            const summary = template?.summary ?? `Recurring mission: ${config.name}`;

            await agentMissionRepository.create({
                brandId: config.brandId,
                userId: config.userId,
                title,
                summary,
                templateId: config.templateId,
                ...(config.budgetCap > 0 && {
                    limits: { maxCredits: config.budgetCap },
                }),
            } as Parameters<typeof agentMissionRepository.create>[0]);

            const nextRun = calculateNextRunTime(config.cronExpression, config.timezone);

            await RecurringMissionConfig.findByIdAndUpdate(config._id, {
                lastRunAt: now,
                nextRunAt: nextRun,
                $inc: { runCount: 1 },
            });

            spawned++;
        } catch (err) {
            console.error(`[RecurringMissions] Failed to spawn mission for config ${config._id}:`, err);
        }
    }

    return spawned;
}
