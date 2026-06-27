import mongoose, { Types } from 'mongoose';
import CrmTag, { ICrmTag } from '../../models/crm/tag.model';

export interface CreateTagDto {
  name: string;
  color?: string;
  description?: string;
  type?: 'contact' | 'company' | 'deal' | 'all';
  createdById: string;
}

export interface UpdateTagDto {
  name?: string;
  color?: string;
  description?: string;
  type?: 'contact' | 'company' | 'deal' | 'all';
}

export class TagRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmTag | null> {
    await this.ensureConnection();
    return CrmTag.findOne({ _id: id }).exec();
  }

  async findByName(name: string): Promise<ICrmTag | null> {
    await this.ensureConnection();
    return CrmTag.findOne({ name }).exec();
  }

  async findAll(
    type?: 'contact' | 'company' | 'deal' | 'all'
  ): Promise<ICrmTag[]> {
    await this.ensureConnection();
    const query: Record<string, unknown> = { };
    if (type && type !== 'all') {
      query.$or = [{ type }, { type: 'all' }];
    }
    return CrmTag.find(query).sort({ name: 1 }).exec();
  }

  async create(data: CreateTagDto): Promise<ICrmTag> {
    await this.ensureConnection();

    const tag = new CrmTag({
      name: data.name,
      color: data.color || '#6366f1',
      description: data.description,
      type: data.type || 'all',
      usageCount: 0,
      createdById: new Types.ObjectId(data.createdById),
    });

    return tag.save();
  }

  async update(id: string, data: UpdateTagDto): Promise<ICrmTag | null> {
    await this.ensureConnection();
    return CrmTag.findOneAndUpdate(
      { _id: id },
      { $set: data },
      { new: true }
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmTag.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  async incrementUsage(id: string, amount: number = 1): Promise<void> {
    await this.ensureConnection();
    await CrmTag.updateOne(
      { _id: id },
      { $inc: { usageCount: amount } }
    ).exec();
  }

  async decrementUsage(id: string, amount: number = 1): Promise<void> {
    await this.ensureConnection();
    await CrmTag.updateOne(
      { _id: id },
      { $inc: { usageCount: -amount } }
    ).exec();
  }

  async merge(
    sourceId: string,
    targetId: string
  ): Promise<{ deletedTag: ICrmTag | null; updatedTag: ICrmTag | null }> {
    await this.ensureConnection();

    const sourceTag = await CrmTag.findOne({ _id: sourceId }).exec();
    const targetTag = await CrmTag.findOne({ _id: targetId }).exec();

    if (!sourceTag || !targetTag) {
      return { deletedTag: null, updatedTag: null };
    }

    // Transfer usage count to target
    await CrmTag.updateOne(
      { _id: targetId },
      { $inc: { usageCount: sourceTag.usageCount } }
    ).exec();

    // Delete source tag
    await CrmTag.deleteOne({ _id: sourceId }).exec();

    const updatedTag = await CrmTag.findById(targetId).exec();

    return { deletedTag: sourceTag, updatedTag };
  }

  async countByOrganization(): Promise<number> {
    await this.ensureConnection();
    return CrmTag.countDocuments({ }).exec();
  }
}

export const tagRepository = new TagRepository();
