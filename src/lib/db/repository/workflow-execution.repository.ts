import { WorkflowExecution, IWorkflowExecution, IExecutionStep } from '../models/workflow-execution.model';
import mongoose from 'mongoose';

export class WorkflowExecutionRepository {
    /**
     * Create a new execution
     */
    async create(executionData: Partial<IWorkflowExecution>): Promise<IWorkflowExecution> {
        const execution = new WorkflowExecution(executionData);
        return await execution.save();
    }

    /**
     * Find execution by ID
     */
    async findById(id: string): Promise<IWorkflowExecution | null> {
        return await WorkflowExecution.findById(id)
            .populate('workflowId', 'name')
            .populate('contactId', 'firstName lastName');
    }

    /**
     * Find executions by workflow ID
     */
    async findByWorkflowId(
        workflowId: string,
        options: {
            status?: string;
            limit?: number;
            skip?: number;
            startDate?: string;
            endDate?: string;
        } = {}
    ): Promise<IWorkflowExecution[]> {
        const query: Record<string, unknown> = { workflowId: new mongoose.Types.ObjectId(workflowId) };

        if (options.status) {
            query.status = options.status;
        }

        if (options.startDate || options.endDate) {
            const createdAtFilter: Record<string, Date> = {};
            if (options.startDate) createdAtFilter.$gte = new Date(options.startDate);
            if (options.endDate) createdAtFilter.$lte = new Date(options.endDate);
            query.createdAt = createdAtFilter;
        }

        let queryBuilder = WorkflowExecution.find(query)
            .sort({ startedAt: -1 })
            .populate('contactId', 'firstName lastName');

        if (options.skip) queryBuilder = queryBuilder.skip(options.skip);
        if (options.limit) queryBuilder = queryBuilder.limit(options.limit);

        return await queryBuilder.exec();
    }

    /**
     * Find executions by user ID with filters
     */
    async findByUserId(
        userId: string,
        options: {
            status?: string;
            limit?: number;
            skip?: number;
            startDate?: string;
            endDate?: string;
        } = {}
    ): Promise<IWorkflowExecution[]> {
        const query: Record<string, unknown> = { userId };

        if (options.status) {
            query.status = options.status;
        }

        if (options.startDate || options.endDate) {
            const createdAtFilter: Record<string, Date> = {};
            if (options.startDate) createdAtFilter.$gte = new Date(options.startDate);
            if (options.endDate) createdAtFilter.$lte = new Date(options.endDate);
            query.createdAt = createdAtFilter;
        }

        let queryBuilder = WorkflowExecution.find(query)
            .sort({ startedAt: -1 })
            .populate('workflowId', 'name')
            .populate('contactId', 'firstName lastName');

        if (options.skip) queryBuilder = queryBuilder.skip(options.skip);
        if (options.limit) queryBuilder = queryBuilder.limit(options.limit);

        return await queryBuilder.exec();
    }

    /**
     * Find executions by contact ID
     */
    async findByContactId(
        contactId: string,
        options: {
            limit?: number;
            skip?: number;
        } = {}
    ): Promise<IWorkflowExecution[]> {
        let queryBuilder = WorkflowExecution.find({
            contactId: new mongoose.Types.ObjectId(contactId)
        })
            .sort({ startedAt: -1 })
            .populate('workflowId', 'name');

        if (options.skip) {
            queryBuilder = queryBuilder.skip(options.skip);
        }

        if (options.limit) {
            queryBuilder = queryBuilder.limit(options.limit);
        }

        return await queryBuilder.exec();
    }

    /**
     * Find running executions
     */
    async findRunning(): Promise<IWorkflowExecution[]> {
        return await WorkflowExecution.find({ status: 'running' })
            .sort({ startedAt: 1 });
    }

    /**
     * Update execution status
     */
    async updateStatus(
        id: string,
        status: 'running' | 'completed' | 'failed' | 'paused',
        error?: string
    ): Promise<IWorkflowExecution | null> {
        const updates: Record<string, unknown> = { status };

        if (status === 'completed' || status === 'failed') {
            updates.completedAt = new Date();
        }

        if (error) {
            updates.error = error;
        }

        return await WorkflowExecution.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true }
        );
    }

    /**
     * Add execution step
     */
    async addStep(
        id: string,
        step: Omit<IExecutionStep, 'timestamp'>
    ): Promise<IWorkflowExecution | null> {
        return await WorkflowExecution.findByIdAndUpdate(
            id,
            {
                $push: {
                    executionPath: {
                        ...step,
                        timestamp: new Date()
                    }
                }
            },
            { new: true }
        );
    }

    /**
     * Update current node
     */
    async updateCurrentNode(id: string, nodeId: string): Promise<IWorkflowExecution | null> {
        return await WorkflowExecution.findByIdAndUpdate(
            id,
            { $set: { currentNodeId: nodeId } },
            { new: true }
        );
    }

    /**
     * Update variables
     */
    async updateVariables(
        id: string,
        variables: Record<string, unknown>
    ): Promise<IWorkflowExecution | null> {
        return await WorkflowExecution.findByIdAndUpdate(
            id,
            { $set: { variables } },
            { new: true }
        );
    }

    /**
     * Get execution statistics for a workflow
     */
    async getWorkflowStats(workflowId: string): Promise<{
        total: number;
        completed: number;
        failed: number;
        running: number;
        avgDuration: number;
    }> {
        const stats = await WorkflowExecution.aggregate([
            {
                $match: {
                    workflowId: new mongoose.Types.ObjectId(workflowId)
                }
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    avgDuration: {
                        $avg: {
                            $subtract: ['$completedAt', '$startedAt']
                        }
                    }
                }
            }
        ]);

        const result = {
            total: 0,
            completed: 0,
            failed: 0,
            running: 0,
            avgDuration: 0
        };

        stats.forEach((stat: { _id: string; count: number; avgDuration?: number }) => {
            result.total += stat.count;
            if (stat._id === 'completed') {
                result.completed = stat.count;
                result.avgDuration = stat.avgDuration || 0;
            } else if (stat._id === 'failed') {
                result.failed = stat.count;
            } else if (stat._id === 'running') {
                result.running = stat.count;
            }
        });

        return result;
    }

    /**
     * Delete old executions
     */
    async deleteOlderThan(days: number): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const result = await WorkflowExecution.deleteMany({
            startedAt: { $lt: cutoffDate },
            status: { $in: ['completed', 'failed'] }
        });

        return result.deletedCount || 0;
    }

    /**
     * Count executions
     */
    async count(workflowId?: string, status?: string): Promise<number> {
        const query: Record<string, unknown> = {};

        if (workflowId) {
            query.workflowId = new mongoose.Types.ObjectId(workflowId);
        }

        if (status) {
            query.status = status;
        }

        return await WorkflowExecution.countDocuments(query);
    }
}

export const workflowExecutionRepository = new WorkflowExecutionRepository();
