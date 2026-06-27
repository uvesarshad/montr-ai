import { WhatsAppWorkflow, IWhatsAppWorkflow } from '../models/whatsapp-workflow.model';
import mongoose from 'mongoose';

export class WhatsAppWorkflowRepository {
    /**
     * Create a new workflow
     */
    async create(workflowData: Partial<IWhatsAppWorkflow>): Promise<IWhatsAppWorkflow> {
        const workflow = new WhatsAppWorkflow(workflowData);
        return await workflow.save();
    }

    /**
     * Find workflow by ID
     */
    async findById(id: string): Promise<IWhatsAppWorkflow | null> {
        return await WhatsAppWorkflow.findById(id);
    }

    /**
     * Find workflows by user ID
     */
    async findByUserId(
        userId: string,
        options?: {
            status?: string;
            limit?: number;
            skip?: number;
            sort?: Record<string, 1 | -1>;
        }
    ): Promise<IWhatsAppWorkflow[]> {
        const query: Record<string, unknown> = { userId: new mongoose.Types.ObjectId(userId) };

        if (options?.status) {
            query.status = options.status;
        }

        let queryBuilder = WhatsAppWorkflow.find(query);

        if (options?.sort) {
            queryBuilder = queryBuilder.sort(options.sort);
        } else {
            queryBuilder = queryBuilder.sort({ updatedAt: -1 });
        }

        if (options?.skip) {
            queryBuilder = queryBuilder.skip(options.skip);
        }

        if (options?.limit) {
            queryBuilder = queryBuilder.limit(options.limit);
        }

        return await queryBuilder.exec();
    }

    /**
     * Find active workflows for a specific trigger type
     */
    async findActiveByTriggerType(triggerType: string): Promise<IWhatsAppWorkflow[]> {
        return await WhatsAppWorkflow.find({
            status: 'active',
            'trigger.type': triggerType
        });
    }

    /**
     * Find active workflows by account ID
     */
    async findActiveByAccountId(accountId: string): Promise<IWhatsAppWorkflow[]> {
        return await WhatsAppWorkflow.find({
            status: 'active',
            accountId: new mongoose.Types.ObjectId(accountId)
        });
    }

    /**
     * Update workflow
     */
    async update(id: string, updates: Partial<IWhatsAppWorkflow>): Promise<IWhatsAppWorkflow | null> {
        return await WhatsAppWorkflow.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, runValidators: true }
        );
    }

    /**
     * Delete workflow
     */
    async delete(id: string): Promise<boolean> {
        const result = await WhatsAppWorkflow.findByIdAndDelete(id);
        return !!result;
    }

    /**
     * Activate workflow
     */
    async activate(id: string): Promise<IWhatsAppWorkflow | null> {
        return await WhatsAppWorkflow.findByIdAndUpdate(
            id,
            { $set: { status: 'active' } },
            { new: true }
        );
    }

    /**
     * Deactivate workflow
     */
    async deactivate(id: string): Promise<IWhatsAppWorkflow | null> {
        return await WhatsAppWorkflow.findByIdAndUpdate(
            id,
            { $set: { status: 'paused' } },
            { new: true }
        );
    }

    /**
     * Clone workflow
     */
    async clone(id: string, userId: string, newName?: string): Promise<IWhatsAppWorkflow> {
        const original = await this.findById(id);
        if (!original) {
            throw new Error('Workflow not found');
        }

        const clonedData = {
            userId: new mongoose.Types.ObjectId(userId),
            name: newName || `${original.name} (Copy)`,
            description: original.description,
            status: 'draft' as const,
            trigger: original.trigger,
            nodes: original.nodes,
            edges: original.edges,
            variables: original.variables,
            accountId: original.accountId
        };

        return await this.create(clonedData);
    }

    /**
     * Increment execution count
     */
    async incrementExecutionCount(id: string): Promise<void> {
        await WhatsAppWorkflow.findByIdAndUpdate(id, {
            $inc: { executionCount: 1 },
            $set: { lastExecutedAt: new Date() }
        });
    }

    /**
     * Count workflows by user
     */
    async countByUserId(userId: string, status?: string): Promise<number> {
        const query: Record<string, unknown> = { userId: new mongoose.Types.ObjectId(userId) };
        if (status) {
            query.status = status;
        }
        return await WhatsAppWorkflow.countDocuments(query);
    }

    /**
     * Search workflows
     */
    async search(
        userId: string,
        searchTerm: string,
        options?: {
            status?: string;
            limit?: number;
            skip?: number;
        }
    ): Promise<IWhatsAppWorkflow[]> {
        const query: Record<string, unknown> = {
            userId: new mongoose.Types.ObjectId(userId),
            $or: [
                { name: { $regex: searchTerm, $options: 'i' } },
                { description: { $regex: searchTerm, $options: 'i' } }
            ]
        };

        if (options?.status) {
            query.status = options.status;
        }

        let queryBuilder = WhatsAppWorkflow.find(query).sort({ updatedAt: -1 });

        if (options?.skip) {
            queryBuilder = queryBuilder.skip(options.skip);
        }

        if (options?.limit) {
            queryBuilder = queryBuilder.limit(options.limit);
        }

        return await queryBuilder.exec();
    }
}

export const whatsappWorkflowRepository = new WhatsAppWorkflowRepository();
