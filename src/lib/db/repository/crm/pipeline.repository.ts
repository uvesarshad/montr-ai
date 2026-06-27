import mongoose, { Types } from 'mongoose';
import CrmPipeline, { ICrmPipeline, IPipelineStage } from '../../models/crm/pipeline.model';

export interface CreatePipelineDto {
  name: string;
  description?: string;
  isDefault?: boolean;
  stages?: Omit<IPipelineStage, '_id'>[];
  currency?: string;
  dealRotting?: boolean;
  createdById: string;
}

export interface UpdatePipelineDto {
  name?: string;
  description?: string;
  isDefault?: boolean;
  isActive?: boolean;
  currency?: string;
  dealRotting?: boolean;
}

export interface CreateStageDto {
  name: string;
  order: number;
  probability?: number;
  color?: string;
  type?: 'open' | 'won' | 'lost';
  rottenDays?: number;
}

export class PipelineRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmPipeline | null> {
    await this.ensureConnection();
    return CrmPipeline.findOne({ _id: id }).exec();
  }

  async findDefault(): Promise<ICrmPipeline | null> {
    await this.ensureConnection();
    return CrmPipeline.findOne({ isDefault: true, isActive: true }).exec();
  }

  async findAll(includeInactive: boolean = false): Promise<ICrmPipeline[]> {
    await this.ensureConnection();
    const query: Record<string, unknown> = { };
    if (!includeInactive) {
      query.isActive = true;
    }
    return CrmPipeline.find(query).sort({ isDefault: -1, name: 1 }).exec();
  }

  async create(data: CreatePipelineDto): Promise<ICrmPipeline> {
    await this.ensureConnection();

    // If this is set as default, unset other defaults
    if (data.isDefault) {
      await CrmPipeline.updateMany(
        { },
        { $set: { isDefault: false } }
      ).exec();
    }

    // Default stages if not provided
    const defaultStages: Omit<IPipelineStage, '_id'>[] = data.stages || [
      { name: 'Lead', order: 0, probability: 10, color: '#94a3b8', type: 'open' },
      { name: 'Qualified', order: 1, probability: 25, color: '#60a5fa', type: 'open' },
      { name: 'Proposal', order: 2, probability: 50, color: '#a78bfa', type: 'open' },
      { name: 'Negotiation', order: 3, probability: 75, color: '#f472b6', type: 'open' },
      { name: 'Won', order: 4, probability: 100, color: '#4ade80', type: 'won' },
      { name: 'Lost', order: 5, probability: 0, color: '#f87171', type: 'lost' },
    ];

    const pipeline = new CrmPipeline({
      name: data.name,
      description: data.description,
      isDefault: data.isDefault || false,
      isActive: true,
      stages: defaultStages.map(stage => ({
        ...stage,
        _id: new Types.ObjectId(),
      })),
      currency: data.currency || 'USD',
      dealRotting: data.dealRotting || false,
      createdById: new Types.ObjectId(data.createdById),
    });

    return pipeline.save();
  }

  async update(
    id: string,
    data: UpdatePipelineDto
  ): Promise<ICrmPipeline | null> {
    await this.ensureConnection();

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await CrmPipeline.updateMany(
        { _id: { $ne: id } },
        { $set: { isDefault: false } }
      ).exec();
    }

    return CrmPipeline.findOneAndUpdate(
      { _id: id },
      { $set: data },
      { new: true }
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmPipeline.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  async addStage(
    pipelineId: string,
    stage: CreateStageDto
  ): Promise<ICrmPipeline | null> {
    await this.ensureConnection();

    const newStage = {
      _id: new Types.ObjectId(),
      name: stage.name,
      order: stage.order,
      probability: stage.probability || 0,
      color: stage.color || '#6366f1',
      type: stage.type || 'open',
      rottenDays: stage.rottenDays,
    };

    return CrmPipeline.findOneAndUpdate(
      { _id: pipelineId },
      { $push: { stages: newStage } },
      { new: true }
    ).exec();
  }

  async updateStage(
    pipelineId: string,
    stageId: string,
    data: Partial<CreateStageDto>
  ): Promise<ICrmPipeline | null> {
    await this.ensureConnection();

    const updateFields: Record<string, unknown> = {};
    if (data.name !== undefined) updateFields['stages.$.name'] = data.name;
    if (data.order !== undefined) updateFields['stages.$.order'] = data.order;
    if (data.probability !== undefined) updateFields['stages.$.probability'] = data.probability;
    if (data.color !== undefined) updateFields['stages.$.color'] = data.color;
    if (data.type !== undefined) updateFields['stages.$.type'] = data.type;
    if (data.rottenDays !== undefined) updateFields['stages.$.rottenDays'] = data.rottenDays;

    return CrmPipeline.findOneAndUpdate(
      { _id: pipelineId, 'stages._id': stageId },
      { $set: updateFields },
      { new: true }
    ).exec();
  }

  async removeStage(
    pipelineId: string,
    stageId: string
  ): Promise<ICrmPipeline | null> {
    await this.ensureConnection();

    return CrmPipeline.findOneAndUpdate(
      { _id: pipelineId },
      { $pull: { stages: { _id: stageId } } },
      { new: true }
    ).exec();
  }

  async reorderStages(
    pipelineId: string,
    stageOrder: { stageId: string; order: number }[]
  ): Promise<ICrmPipeline | null> {
    await this.ensureConnection();

    const pipeline = await CrmPipeline.findOne({ _id: pipelineId }).exec();
    if (!pipeline) return null;

    // Update order for each stage
    for (const item of stageOrder) {
      const stage = pipeline.stages.find(s => s._id.toString() === item.stageId);
      if (stage) {
        stage.order = item.order;
      }
    }

    // Sort stages by order
    pipeline.stages.sort((a, b) => a.order - b.order);

    return pipeline.save();
  }

  async updateStages(
    pipelineId: string,
    stages: IPipelineStage[]
  ): Promise<ICrmPipeline | null> {
    await this.ensureConnection();

    return CrmPipeline.findOneAndUpdate(
      { _id: pipelineId },
      { $set: { stages } },
      { new: true }
    ).exec();
  }

  async duplicate(
    id: string,
    newName: string,
    createdById: string
  ): Promise<ICrmPipeline> {
    await this.ensureConnection();

    const original = await CrmPipeline.findOne({ _id: id }).exec();
    if (!original) {
      throw new Error('Pipeline not found');
    }

    const pipeline = new CrmPipeline({
      name: newName,
      description: original.description,
      isDefault: false,
      isActive: true,
      stages: original.stages.map(stage => ({
        // @ts-expect-error
        ...stage.toObject(),
        _id: new Types.ObjectId(),
      })),
      currency: original.currency,
      dealRotting: original.dealRotting,
      createdById: new Types.ObjectId(createdById),
    });

    return pipeline.save();
  }

  async countByOrganization(): Promise<number> {
    await this.ensureConnection();
    return CrmPipeline.countDocuments({ isActive: true }).exec();
  }
}

export const pipelineRepository = new PipelineRepository();
