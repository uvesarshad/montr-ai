import mongoose, { Types } from 'mongoose';
import CrmView, { ICrmView, IViewFilter, IViewFilterTree, IViewSort } from '../../models/crm/view.model';

export interface CreateViewDto {
  name: string;
  entityType: 'contact' | 'company' | 'deal' | 'activity';
  icon?: string;
  color?: string;
  filters?: IViewFilter[];
  filterTree?: IViewFilterTree;
  sort?: IViewSort;
  columns?: string[];
  columnWidths?: Record<string, number>;
  groupBy?: string;
  visibility?: 'private' | 'team' | 'organization';
  sharedWith?: string[];
  order?: number;
  isPinned?: boolean;
  isDefault?: boolean;
  openRecordIn?: 'panel' | 'page';
  createdById: string;
}

export interface UpdateViewDto {
  name?: string;
  icon?: string;
  color?: string;
  filters?: IViewFilter[];
  filterTree?: IViewFilterTree;
  sort?: IViewSort;
  columns?: string[];
  columnWidths?: Record<string, number>;
  groupBy?: string;
  visibility?: 'private' | 'team' | 'organization';
  sharedWith?: string[];
  order?: number;
  isPinned?: boolean;
  isDefault?: boolean;
  openRecordIn?: 'panel' | 'page';
}

export class ViewRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmView | null> {
    await this.ensureConnection();
    return CrmView.findOne({ _id: id }).exec();
  }

  async findByEntityType(
    entityType: 'contact' | 'company' | 'deal' | 'activity',
    userId: string
  ): Promise<ICrmView[]> {
    await this.ensureConnection();
    return CrmView.find({
      entityType,
      $or: [
        { visibility: 'organization' },
        { visibility: 'team', sharedWith: new Types.ObjectId(userId) },
        { ownerId: new Types.ObjectId(userId) },
      ],
    })
      .sort({ isPinned: -1, order: 1, name: 1 })
      .exec();
  }

  async findUserViews(userId: string): Promise<ICrmView[]> {
    await this.ensureConnection();
    return CrmView.find({
      $or: [
        { visibility: 'organization' },
        { visibility: 'team', sharedWith: new Types.ObjectId(userId) },
        { ownerId: new Types.ObjectId(userId) },
      ],
    })
      .sort({ entityType: 1, isPinned: -1, order: 1 })
      .exec();
  }

  async findDefault(
    entityType: 'contact' | 'company' | 'deal' | 'activity'
  ): Promise<ICrmView | null> {
    await this.ensureConnection();
    return CrmView.findOne({ entityType, isDefault: true }).exec();
  }

  async create(data: CreateViewDto): Promise<ICrmView> {
    await this.ensureConnection();

    // If this is set as default, unset other defaults
    if (data.isDefault) {
      await CrmView.updateMany(
        { entityType: data.entityType },
        { $set: { isDefault: false } }
      ).exec();
    }

    // Auto-generate order if not provided
    let order = data.order;
    if (order === undefined) {
      const maxOrder = await CrmView.findOne({
        entityType: data.entityType,
      })
        .sort({ order: -1 })
        .select('order')
        .exec();
      order = (maxOrder?.order || 0) + 1;
    }

    const view = new CrmView({
      name: data.name,
      entityType: data.entityType,
      icon: data.icon,
      color: data.color,
      filters: data.filters || [],
      sort: data.sort,
      columns: data.columns || [],
      columnWidths: data.columnWidths || {},
      groupBy: data.groupBy,
      visibility: data.visibility || 'private',
      ownerId: new Types.ObjectId(data.createdById),
      sharedWith: data.sharedWith?.map(id => new Types.ObjectId(id)) || [],
      order,
      isPinned: data.isPinned || false,
      isDefault: data.isDefault || false,
      createdById: new Types.ObjectId(data.createdById),
    });

    return view.save();
  }

  async update(id: string, data: UpdateViewDto): Promise<ICrmView | null> {
    await this.ensureConnection();

    // If setting as default, unset other defaults
    if (data.isDefault) {
      const view = await CrmView.findOne({ _id: id }).exec();
      if (view) {
        await CrmView.updateMany(
          { entityType: view.entityType, _id: { $ne: id } },
          { $set: { isDefault: false } }
        ).exec();
      }
    }

    const updateData: Record<string, unknown> = { ...data };
    if (data.sharedWith) {
      updateData.sharedWith = data.sharedWith.map(id => new Types.ObjectId(id));
    }

    return CrmView.findOneAndUpdate(
      { _id: id },
      { $set: updateData },
      { new: true }
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmView.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  async duplicate(
    id: string,
    newName: string,
    createdById: string
  ): Promise<ICrmView> {
    await this.ensureConnection();

    const original = await CrmView.findOne({ _id: id }).exec();
    if (!original) {
      throw new Error('View not found');
    }

    const view = new CrmView({
      name: newName,
      entityType: original.entityType,
      icon: original.icon,
      color: original.color,
      filters: original.filters,
      sort: original.sort,
      columns: original.columns,
      columnWidths: original.columnWidths,
      groupBy: original.groupBy,
      visibility: 'private',
      ownerId: new Types.ObjectId(createdById),
      sharedWith: [],
      order: original.order + 1,
      isPinned: false,
      isDefault: false,
      createdById: new Types.ObjectId(createdById),
    });

    return view.save();
  }

  async reorder(
    entityType: string,
    viewOrder: { id: string; order: number }[]
  ): Promise<void> {
    await this.ensureConnection();
    const bulkOps = viewOrder.map(item => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(item.id), entityType },
        update: { $set: { order: item.order } },
      },
    }));
    await CrmView.bulkWrite(bulkOps);
  }
}

export const viewRepository = new ViewRepository();
