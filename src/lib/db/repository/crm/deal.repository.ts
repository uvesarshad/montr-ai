// OSS single-tenant override of src/lib/db/repository/crm/deal.repository.ts — generated CP-2 hand-patch; org-stripped, userId-scoped.
import mongoose, { FilterQuery, Types } from 'mongoose';
import CrmDeal, { ICrmDeal } from '../../models/crm/deal.model';

export interface CreateDealDto {
  name: string;
  description?: string;
  contactId?: string;
  companyId?: string;
  pipelineId: string;
  stageId: string;
  value?: number;
  currency?: string;
  probability?: number;
  expectedCloseDate?: Date;
  status?: ICrmDeal['status'];
  priority?: ICrmDeal['priority'];
  source?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
  ownerId?: string;
  notes?: ICrmDeal['notes'];
  createdById: string;
}

export interface UpdateDealDto {
  name?: string;
  description?: string;
  contactId?: string | null;
  companyId?: string | null;
  pipelineId?: string;
  stageId?: string;
  value?: number;
  currency?: string;
  probability?: number;
  expectedCloseDate?: Date | null;
  actualCloseDate?: Date | null;
  status?: ICrmDeal['status'];
  lostReason?: string;
  wonReason?: string;
  priority?: ICrmDeal['priority'];
  source?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
  ownerId?: string | null;
  notes?: ICrmDeal['notes'];
}

export interface DealFilters {
  search?: string;
  pipelineId?: string;
  stageId?: string;
  stageIds?: string[];
  status?: ICrmDeal['status'] | ICrmDeal['status'][];
  ownerId?: string;
  contactId?: string;
  companyId?: string;
  priority?: ICrmDeal['priority'];
  tags?: string[];
  minValue?: number;
  maxValue?: number;
  expectedCloseBefore?: Date;
  expectedCloseAfter?: Date;
  createdAfter?: Date;
  createdBefore?: Date;
  // Pre-built Mongo fragment from a saved view's nested filter tree.
  // ALWAYS merged via $and AFTER mandatory soft-delete/security scope.
  filterTreeMongo?: Record<string, unknown>;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export class DealRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmDeal | null> {
    await this.ensureConnection();
    return CrmDeal.findOne({ _id: id, deletedAt: null }).exec();
  }

  /** Like findById but includes soft-deleted rows — used by restore. */
  async findByIdIncludingDeleted(id: string): Promise<ICrmDeal | null> {
    await this.ensureConnection();
    return CrmDeal.findOne({ _id: id }).exec();
  }

  async find(
    filters: DealFilters = {},
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmDeal>> {
    await this.ensureConnection();

    const { page = 1, limit = 25, sort = 'createdAt', sortDirection = 'desc' } = options;
    const skip = (page - 1) * limit;

    const query: FilterQuery<ICrmDeal> = { deletedAt: null };

    if (filters.search) {
      query.$text = { $search: filters.search };
    }
    if (filters.pipelineId) {
      query.pipelineId = new Types.ObjectId(filters.pipelineId);
    }
    if (filters.stageId) {
      query.stageId = new Types.ObjectId(filters.stageId);
    }
    if (filters.stageIds && filters.stageIds.length > 0) {
      query.stageId = { $in: filters.stageIds.map(id => new Types.ObjectId(id)) };
    }
    if (filters.status) {
      query.status = Array.isArray(filters.status) ? { $in: filters.status } : filters.status;
    }
    if (filters.ownerId) {
      query.ownerId = new Types.ObjectId(filters.ownerId);
    }
    if (filters.contactId) {
      query.contactId = new Types.ObjectId(filters.contactId);
    }
    if (filters.companyId) {
      query.companyId = new Types.ObjectId(filters.companyId);
    }
    if (filters.priority) {
      query.priority = filters.priority;
    }
    if (filters.tags && filters.tags.length > 0) {
      query.tags = { $in: filters.tags.map(id => new Types.ObjectId(id)) };
    }
    if (filters.minValue !== undefined || filters.maxValue !== undefined) {
      query.value = {};
      if (filters.minValue !== undefined) query.value.$gte = filters.minValue;
      if (filters.maxValue !== undefined) query.value.$lte = filters.maxValue;
    }
    if (filters.expectedCloseBefore || filters.expectedCloseAfter) {
      query.expectedCloseDate = {};
      if (filters.expectedCloseAfter) query.expectedCloseDate.$gte = filters.expectedCloseAfter;
      if (filters.expectedCloseBefore) query.expectedCloseDate.$lte = filters.expectedCloseBefore;
    }
    if (filters.createdAfter || filters.createdBefore) {
      query.createdAt = {};
      if (filters.createdAfter) query.createdAt.$gte = filters.createdAfter;
      if (filters.createdBefore) query.createdAt.$lte = filters.createdBefore;
    }
    if (filters.filterTreeMongo) {
      query.$and = [...(query.$and ?? []), filters.filterTreeMongo as FilterQuery<ICrmDeal>];
    }

    const sortObj: Record<string, 1 | -1> = { [sort]: sortDirection === 'asc' ? 1 : -1 };

    const [data, total] = await Promise.all([
      CrmDeal.find(query).sort(sortObj).skip(skip).limit(limit).exec(),
      CrmDeal.countDocuments(query).exec(),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }

  async findByPipeline(pipelineId: string): Promise<ICrmDeal[]> {
    await this.ensureConnection();
    return CrmDeal.find({
      pipelineId: new Types.ObjectId(pipelineId),
      deletedAt: null,
      status: 'open',
    }).sort({ createdAt: -1 }).exec();
  }

  async findByStage(stageId: string): Promise<ICrmDeal[]> {
    await this.ensureConnection();
    return CrmDeal.find({
      stageId: new Types.ObjectId(stageId),
      deletedAt: null,
    }).sort({ createdAt: -1 }).exec();
  }

  async findAll(query: Record<string, unknown> = {}): Promise<ICrmDeal[]> {
    await this.ensureConnection();
    return CrmDeal.find({ deletedAt: null, ...query }).exec();
  }

  /**
   * List query with sort + hard limit — used by the workflow `find_records`
   * node. Soft-delete scope always applied on top of `query`.
   */
  async findManyForAutomation(
    query: Record<string, unknown> = {},
    options: { sort?: Record<string, 1 | -1>; limit?: number } = {}
  ): Promise<ICrmDeal[]> {
    await this.ensureConnection();
    const limit = Math.max(1, Math.min(options.limit ?? 100, 500));
    return CrmDeal.find({ ...query, deletedAt: null })
      .sort(options.sort ?? { createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async create(data: CreateDealDto): Promise<ICrmDeal> {
    await this.ensureConnection();

    const now = new Date();
    const deal = new CrmDeal({
      ...data,
      contactId: data.contactId ? new Types.ObjectId(data.contactId) : undefined,
      companyId: data.companyId ? new Types.ObjectId(data.companyId) : undefined,
      pipelineId: new Types.ObjectId(data.pipelineId),
      stageId: new Types.ObjectId(data.stageId),
      tags: data.tags?.map(id => new Types.ObjectId(id)) || [],
      ownerId: data.ownerId ? new Types.ObjectId(data.ownerId) : undefined,
      createdById: new Types.ObjectId(data.createdById),
      assignedAt: data.ownerId ? now : undefined,
      stageHistory: [{
        stageId: new Types.ObjectId(data.stageId),
        stageName: '', // Will be populated by the caller
        enteredAt: now,
      }],
    });

    return deal.save();
  }

  async update(
    id: string,
    data: UpdateDealDto
  ): Promise<ICrmDeal | null> {
    await this.ensureConnection();

    const updateData: Record<string, unknown> = { ...data };

    if (data.contactId !== undefined) {
      updateData.contactId = data.contactId ? new Types.ObjectId(data.contactId) : null;
    }
    if (data.companyId !== undefined) {
      updateData.companyId = data.companyId ? new Types.ObjectId(data.companyId) : null;
    }
    if (data.pipelineId) {
      updateData.pipelineId = new Types.ObjectId(data.pipelineId);
    }
    if (data.stageId) {
      updateData.stageId = new Types.ObjectId(data.stageId);
    }
    if (data.tags) {
      updateData.tags = data.tags.map(id => new Types.ObjectId(id));
    }
    if (data.ownerId !== undefined) {
      updateData.ownerId = data.ownerId ? new Types.ObjectId(data.ownerId) : null;
      if (data.ownerId) updateData.assignedAt = new Date();
    }

    return CrmDeal.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: updateData },
      { new: true }
    ).exec();
  }

  async moveToStage(
    id: string,
    newStageId: string,
    stageName: string
  ): Promise<ICrmDeal | null> {
    await this.ensureConnection();

    const now = new Date();

    // First, close the current stage in history
    await CrmDeal.updateOne(
      { _id: id, 'stageHistory.exitedAt': null },
      {
        $set: {
          'stageHistory.$.exitedAt': now,
          'stageHistory.$.duration': { $subtract: [now, '$stageHistory.$.enteredAt'] },
        },
      }
    ).exec();

    // Then update the stage and add new history entry
    return CrmDeal.findOneAndUpdate(
      { _id: id },
      {
        $set: { stageId: new Types.ObjectId(newStageId) },
        $push: {
          stageHistory: {
            stageId: new Types.ObjectId(newStageId),
            stageName,
            enteredAt: now,
          },
        },
      },
      { new: true }
    ).exec();
  }

  async markAsWon(
    id: string,
    wonReason?: string
  ): Promise<ICrmDeal | null> {
    await this.ensureConnection();

    return CrmDeal.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          status: 'won',
          actualCloseDate: new Date(),
          wonReason,
        },
      },
      { new: true }
    ).exec();
  }

  async markAsLost(
    id: string,
    lostReason?: string
  ): Promise<ICrmDeal | null> {
    await this.ensureConnection();

    return CrmDeal.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          status: 'lost',
          actualCloseDate: new Date(),
          lostReason,
        },
      },
      { new: true }
    ).exec();
  }

  /** Soft delete — flags the deal as trashed; activities are kept. */
  async softDelete(id: string, userId?: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmDeal.updateOne(
      { _id: id, deletedAt: null },
      { $set: { deletedAt: new Date(), deletedById: userId ? new Types.ObjectId(userId) : undefined } }
    ).exec();
    return result.modifiedCount > 0;
  }

  async restore(id: string): Promise<ICrmDeal | null> {
    await this.ensureConnection();
    return CrmDeal.findOneAndUpdate(
      { _id: id, deletedAt: { $ne: null } },
      { $unset: { deletedAt: 1, deletedById: 1 } },
      { new: true }
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmDeal.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  /** Bulk hard delete deals in one round-trip; returns the deleted count. */
  async bulkDelete(ids: string[]): Promise<number> {
    await this.ensureConnection();
    if (ids.length === 0) return 0;
    const result = await CrmDeal.deleteMany({
      _id: { $in: ids.map(id => new Types.ObjectId(id)) },
    }).exec();
    return result.deletedCount;
  }

  /** Bulk soft delete deals in one round-trip. */
  async bulkSoftDelete(ids: string[], userId?: string): Promise<number> {
    await this.ensureConnection();
    if (ids.length === 0) return 0;
    const result = await CrmDeal.updateMany(
      { _id: { $in: ids.map(id => new Types.ObjectId(id)) }, deletedAt: null },
      { $set: { deletedAt: new Date(), deletedById: userId ? new Types.ObjectId(userId) : undefined } }
    ).exec();
    return result.modifiedCount;
  }

  async listTrashed(
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmDeal>> {
    await this.ensureConnection();
    const { page = 1, limit = 25 } = options;
    const skip = (page - 1) * limit;
    const query: FilterQuery<ICrmDeal> = { deletedAt: { $ne: null } };
    const [data, total] = await Promise.all([
      CrmDeal.find(query).sort({ deletedAt: -1 }).skip(skip).limit(limit).exec(),
      CrmDeal.countDocuments(query).exec(),
    ]);
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total },
    };
  }

  async purgeOlderThan(date: Date): Promise<number> {
    await this.ensureConnection();
    const query: FilterQuery<ICrmDeal> = { deletedAt: { $ne: null, $lt: date } };
    const result = await CrmDeal.deleteMany(query).exec();
    return result.deletedCount;
  }

  /**
   * Bulk update many deals with a shared patch. Object-id-typed fields in
   * `data` are translated to ObjectId before the updateMany. Returns the
   * Mongo modifiedCount.
   */
  async bulkUpdate(
    ids: string[],
    data: Partial<UpdateDealDto>,
  ): Promise<number> {
    await this.ensureConnection();
    if (ids.length === 0) return 0;
    const updateData: Record<string, unknown> = { ...data };
    if (data.tags) {
      updateData.tags = data.tags.map(id => new Types.ObjectId(id));
    }
    if (data.ownerId) {
      updateData.ownerId = new Types.ObjectId(data.ownerId);
    }
    if (data.contactId) {
      updateData.contactId = new Types.ObjectId(data.contactId);
    }
    if (data.companyId) {
      updateData.companyId = new Types.ObjectId(data.companyId);
    }
    if (data.stageId) {
      updateData.stageId = new Types.ObjectId(data.stageId);
    }
    if (data.pipelineId) {
      updateData.pipelineId = new Types.ObjectId(data.pipelineId);
    }
    const result = await CrmDeal.updateMany(
      {
        _id: { $in: ids.map(id => new Types.ObjectId(id)) },
        deletedAt: null,
      },
      { $set: updateData },
    ).exec();
    return result.modifiedCount;
  }

  /** Bulk add tags to many deals in one round-trip. */
  async bulkAddTags(
    ids: string[],
    tagIds: string[],
  ): Promise<number> {
    await this.ensureConnection();
    if (ids.length === 0 || tagIds.length === 0) return 0;
    const result = await CrmDeal.updateMany(
      {
        _id: { $in: ids.map(id => new Types.ObjectId(id)) },
      },
      {
        $addToSet: {
          tags: { $each: tagIds.map(id => new Types.ObjectId(id)) },
        },
      },
    ).exec();
    return result.modifiedCount;
  }

  /** Bulk remove tags from many deals in one round-trip. */
  async bulkRemoveTags(
    ids: string[],
    tagIds: string[],
  ): Promise<number> {
    await this.ensureConnection();
    if (ids.length === 0 || tagIds.length === 0) return 0;
    const result = await CrmDeal.updateMany(
      {
        _id: { $in: ids.map(id => new Types.ObjectId(id)) },
      },
      {
        $pull: {
          tags: { $in: tagIds.map(id => new Types.ObjectId(id)) },
        },
      },
    ).exec();
    return result.modifiedCount;
  }

  async getStats(pipelineId?: string): Promise<{
    total: number;
    open: number;
    won: number;
    lost: number;
    totalValue: number;
    wonValue: number;
  }> {
    await this.ensureConnection();

    const matchStage: Record<string, unknown> = { deletedAt: null };
    if (pipelineId) {
      matchStage.pipelineId = new Types.ObjectId(pipelineId);
    }

    const result = await CrmDeal.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
          won: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
          lost: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } },
          totalValue: { $sum: '$value' },
          wonValue: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, '$value', 0] } },
        },
      },
    ]).exec();

    return result[0] || { total: 0, open: 0, won: 0, lost: 0, totalValue: 0, wonValue: 0 };
  }

  async getByStageStats(pipelineId: string): Promise<{
    stageId: string;
    count: number;
    totalValue: number;
  }[]> {
    await this.ensureConnection();

    return CrmDeal.aggregate([
      {
        $match: {
          pipelineId: new Types.ObjectId(pipelineId),
          deletedAt: null,
          status: 'open',
        },
      },
      {
        $group: {
          _id: '$stageId',
          count: { $sum: 1 },
          totalValue: { $sum: '$value' },
        },
      },
      {
        $project: {
          stageId: '$_id',
          count: 1,
          totalValue: 1,
          _id: 0,
        },
      },
    ]).exec();
  }

  async findByContact(
    contactId: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmDeal>> {
    return this.find({ contactId }, options);
  }

  async findByCompany(
    companyId: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmDeal>> {
    return this.find({ companyId }, options);
  }

  /**
   * Count of all (non-deleted) deals. Name retained for call-site stability;
   * in single-tenant this is the install-wide total (no org scope).
   */
  async countByOrganization(): Promise<number> {
    await this.ensureConnection();
    return CrmDeal.countDocuments({ deletedAt: null }).exec();
  }
}

export const dealRepository = new DealRepository();
