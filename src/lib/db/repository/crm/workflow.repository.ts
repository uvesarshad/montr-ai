import mongoose, { Types } from 'mongoose';
import CrmWorkflow, { ICrmWorkflow, IWorkflowTrigger, IWorkflowCondition, IWorkflowAction } from '../../models/crm/workflow.model';

export interface CreateWorkflowDto {
  name: string;
  description?: string;
  trigger: IWorkflowTrigger;
  conditions?: IWorkflowCondition[];
  actions: IWorkflowAction[];
  runOnce?: boolean;
  maxExecutions?: number;
  cooldownMinutes?: number;
  createdById: string;
}

export interface UpdateWorkflowDto {
  name?: string;
  description?: string;
  trigger?: IWorkflowTrigger;
  conditions?: IWorkflowCondition[];
  actions?: IWorkflowAction[];
  runOnce?: boolean;
  maxExecutions?: number;
  cooldownMinutes?: number;
}

export class WorkflowRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmWorkflow | null> {
    await this.ensureConnection();
    return CrmWorkflow.findOne({ _id: id }).exec();
  }

  async findAll(activeOnly: boolean = false): Promise<ICrmWorkflow[]> {
    await this.ensureConnection();
    const query: Record<string, unknown> = { };
    if (activeOnly) {
      query.isActive = true;
    }
    return CrmWorkflow.find(query).sort({ name: 1 }).exec();
  }

  async findByTrigger(
    triggerType: string,
    entityType?: string
  ): Promise<ICrmWorkflow[]> {
    await this.ensureConnection();
    const query: Record<string, unknown> = {
      isActive: true,
      'trigger.type': triggerType,
    };
    if (entityType) {
      query['trigger.entityType'] = entityType;
    }
    return CrmWorkflow.find(query).exec();
  }

  async create(data: CreateWorkflowDto): Promise<ICrmWorkflow> {
    await this.ensureConnection();

    const workflow = new CrmWorkflow({
      name: data.name,
      description: data.description,
      isActive: false,
      trigger: data.trigger,
      conditions: data.conditions || [],
      actions: data.actions,
      runOnce: data.runOnce || false,
      maxExecutions: data.maxExecutions,
      cooldownMinutes: data.cooldownMinutes,
      executionCount: 0,
      errorCount: 0,
      createdById: new Types.ObjectId(data.createdById),
    });

    return workflow.save();
  }

  async update(
    id: string,
    data: UpdateWorkflowDto
  ): Promise<ICrmWorkflow | null> {
    await this.ensureConnection();
    return CrmWorkflow.findOneAndUpdate(
      { _id: id },
      { $set: data },
      { new: true }
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmWorkflow.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  async activate(id: string): Promise<ICrmWorkflow | null> {
    await this.ensureConnection();
    return CrmWorkflow.findOneAndUpdate(
      { _id: id },
      { $set: { isActive: true } },
      { new: true }
    ).exec();
  }

  async deactivate(id: string): Promise<ICrmWorkflow | null> {
    await this.ensureConnection();
    return CrmWorkflow.findOneAndUpdate(
      { _id: id },
      { $set: { isActive: false } },
      { new: true }
    ).exec();
  }

  async incrementExecutionCount(id: string): Promise<void> {
    await this.ensureConnection();
    await CrmWorkflow.updateOne(
      { _id: id },
      { $inc: { executionCount: 1 }, $set: { lastExecutedAt: new Date() } }
    ).exec();
  }

  async incrementErrorCount(id: string): Promise<void> {
    await this.ensureConnection();
    await CrmWorkflow.updateOne(
      { _id: id },
      { $inc: { errorCount: 1 } }
    ).exec();
  }

  async countByOrganization(activeOnly: boolean = false): Promise<number> {
    await this.ensureConnection();
    const query: Record<string, unknown> = { };
    if (activeOnly) {
      query.isActive = true;
    }
    return CrmWorkflow.countDocuments(query).exec();
  }
}

export const workflowRepository = new WorkflowRepository();
