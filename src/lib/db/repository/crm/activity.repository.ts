// OSS single-tenant override of src/lib/db/repository/crm/activity.repository.ts — generated CP-2 hand-patch; org-stripped, userId-scoped.
import mongoose, { FilterQuery, Types } from 'mongoose';
import CrmActivity, { ICrmActivity, ActivityType } from '../../models/crm/activity.model';

export interface CreateActivityDto {
  type: ActivityType;
  subtype?: string;
  targetType: 'contact' | 'company' | 'deal';
  targetId: string;
  contactId?: string;
  companyId?: string;
  dealId?: string;
  subject?: string;
  body?: string;
  bodyPlain?: string;
  dueDate?: Date;
  reminderAt?: Date;
  priority?: 'low' | 'medium' | 'high';
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  location?: string;
  meetingLink?: string;
  attendees?: ICrmActivity['attendees'];
  outcome?: string;
  emailMetadata?: ICrmActivity['emailMetadata'];
  messageMetadata?: ICrmActivity['messageMetadata'];
  calendarMetadata?: ICrmActivity['calendarMetadata'];
  isPrivate?: boolean;
  isPinned?: boolean;
  completed?: boolean;
  assignedTo?: string;
  createdById: string;
}

export interface UpdateActivityDto {
  type?: ActivityType;
  subtype?: string;
  subject?: string;
  body?: string;
  bodyPlain?: string;
  dueDate?: Date;
  reminderAt?: Date;
  priority?: 'low' | 'medium' | 'high';
  completed?: boolean;
  completedAt?: Date;
  completedById?: string;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  location?: string;
  meetingLink?: string;
  attendees?: ICrmActivity['attendees'];
  outcome?: string;
  isPrivate?: boolean;
  isPinned?: boolean;
  assignedTo?: string | null;
}

export interface ActivityFilters {
  type?: ActivityType | ActivityType[];
  targetType?: 'contact' | 'company' | 'deal';
  targetId?: string;
  contactId?: string;
  companyId?: string;
  dealId?: string;
  completed?: boolean;
  assignedTo?: string;
  createdById?: string;
  dueBefore?: Date;
  dueAfter?: Date;
  createdAfter?: Date;
  createdBefore?: Date;
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

export class ActivityRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmActivity | null> {
    await this.ensureConnection();
    return CrmActivity.findOne({ _id: id, deletedAt: null }).exec();
  }

  /** Like findById but includes soft-deleted rows — used by restore. */
  async findByIdIncludingDeleted(id: string): Promise<ICrmActivity | null> {
    await this.ensureConnection();
    return CrmActivity.findOne({ _id: id }).exec();
  }

  async find(
    filters: ActivityFilters = {},
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmActivity>> {
    await this.ensureConnection();

    const { page = 1, limit = 25, sort = 'createdAt', sortDirection = 'desc' } = options;
    const skip = (page - 1) * limit;

    const query: FilterQuery<ICrmActivity> = { deletedAt: null };

    if (filters.type) {
      query.type = Array.isArray(filters.type) ? { $in: filters.type } : filters.type;
    }
    if (filters.targetType) {
      query.targetType = filters.targetType;
    }
    if (filters.targetId) {
      query.targetId = new Types.ObjectId(filters.targetId);
    }
    if (filters.contactId) {
      query.contactId = new Types.ObjectId(filters.contactId);
    }
    if (filters.companyId) {
      query.companyId = new Types.ObjectId(filters.companyId);
    }
    if (filters.dealId) {
      query.dealId = new Types.ObjectId(filters.dealId);
    }
    if (filters.completed !== undefined) {
      query.completed = filters.completed;
    }
    if (filters.assignedTo) {
      query.assignedTo = new Types.ObjectId(filters.assignedTo);
    }
    if (filters.createdById) {
      query.createdById = new Types.ObjectId(filters.createdById);
    }
    if (filters.dueBefore || filters.dueAfter) {
      query.dueDate = {};
      if (filters.dueAfter) query.dueDate.$gte = filters.dueAfter;
      if (filters.dueBefore) query.dueDate.$lte = filters.dueBefore;
    }
    if (filters.createdAfter || filters.createdBefore) {
      query.createdAt = {};
      if (filters.createdAfter) query.createdAt.$gte = filters.createdAfter;
      if (filters.createdBefore) query.createdAt.$lte = filters.createdBefore;
    }

    const sortObj: Record<string, 1 | -1> = { [sort]: sortDirection === 'asc' ? 1 : -1 };

    const [data, total] = await Promise.all([
      CrmActivity.find(query).sort(sortObj).skip(skip).limit(limit).exec(),
      CrmActivity.countDocuments(query).exec(),
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

  async findTimeline(
    targetType: 'contact' | 'company' | 'deal',
    targetId: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmActivity>> {
    return this.find(
      { targetType, targetId },
      { ...options, sort: 'createdAt', sortDirection: 'desc' }
    );
  }

  async findTasks(
    filters: { assignedTo?: string; completed?: boolean; overdue?: boolean } = {},
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmActivity>> {
    await this.ensureConnection();

    const { page = 1, limit = 25, sort = 'dueDate', sortDirection = 'asc' } = options;
    const skip = (page - 1) * limit;

    const query: FilterQuery<ICrmActivity> = {
      deletedAt: null,
      type: 'task',
    };

    if (filters.assignedTo) {
      query.assignedTo = new Types.ObjectId(filters.assignedTo);
    }
    if (filters.completed !== undefined) {
      query.completed = filters.completed;
    }
    if (filters.overdue) {
      query.dueDate = { $lt: new Date() };
      query.completed = false;
    }

    const sortObj: Record<string, 1 | -1> = { [sort]: sortDirection === 'asc' ? 1 : -1 };

    const [data, total] = await Promise.all([
      CrmActivity.find(query).sort(sortObj).skip(skip).limit(limit).exec(),
      CrmActivity.countDocuments(query).exec(),
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

  async create(data: CreateActivityDto): Promise<ICrmActivity> {
    await this.ensureConnection();

    const activity = new CrmActivity({
      ...data,
      targetId: new Types.ObjectId(data.targetId),
      contactId: data.contactId ? new Types.ObjectId(data.contactId) : undefined,
      companyId: data.companyId ? new Types.ObjectId(data.companyId) : undefined,
      dealId: data.dealId ? new Types.ObjectId(data.dealId) : undefined,
      assignedTo: data.assignedTo ? new Types.ObjectId(data.assignedTo) : undefined,
      createdById: new Types.ObjectId(data.createdById),
    });

    return activity.save();
  }

  async update(
    id: string,
    data: UpdateActivityDto
  ): Promise<ICrmActivity | null> {
    await this.ensureConnection();

    const updateData: Record<string, unknown> = { ...data };

    if (data.assignedTo !== undefined) {
      updateData.assignedTo = data.assignedTo ? new Types.ObjectId(data.assignedTo) : null;
    }
    if (data.completedById) {
      updateData.completedById = new Types.ObjectId(data.completedById);
    }

    return CrmActivity.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: updateData },
      { new: true }
    ).exec();
  }

  /** Soft delete — flags the activity as trashed. */
  async softDelete(id: string, userId?: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmActivity.updateOne(
      { _id: id, deletedAt: null },
      { $set: { deletedAt: new Date(), deletedById: userId ? new Types.ObjectId(userId) : undefined } }
    ).exec();
    return result.modifiedCount > 0;
  }

  async restore(id: string): Promise<ICrmActivity | null> {
    await this.ensureConnection();
    return CrmActivity.findOneAndUpdate(
      { _id: id, deletedAt: { $ne: null } },
      { $unset: { deletedAt: 1, deletedById: 1 } },
      { new: true }
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmActivity.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  /** Bulk hard delete activities in one round-trip; returns deletedCount. */
  async bulkDelete(ids: string[]): Promise<number> {
    await this.ensureConnection();
    if (ids.length === 0) return 0;
    const result = await CrmActivity.deleteMany({
      _id: { $in: ids.map(id => new Types.ObjectId(id)) },
    }).exec();
    return result.deletedCount;
  }

  /** Bulk soft delete activities in one round-trip. */
  async bulkSoftDelete(ids: string[], userId?: string): Promise<number> {
    await this.ensureConnection();
    if (ids.length === 0) return 0;
    const result = await CrmActivity.updateMany(
      { _id: { $in: ids.map(id => new Types.ObjectId(id)) }, deletedAt: null },
      { $set: { deletedAt: new Date(), deletedById: userId ? new Types.ObjectId(userId) : undefined } }
    ).exec();
    return result.modifiedCount;
  }

  async listTrashed(
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmActivity>> {
    await this.ensureConnection();
    const { page = 1, limit = 25 } = options;
    const skip = (page - 1) * limit;
    const query: FilterQuery<ICrmActivity> = { deletedAt: { $ne: null } };
    const [data, total] = await Promise.all([
      CrmActivity.find(query).sort({ deletedAt: -1 }).skip(skip).limit(limit).exec(),
      CrmActivity.countDocuments(query).exec(),
    ]);
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total },
    };
  }

  async purgeOlderThan(date: Date): Promise<number> {
    await this.ensureConnection();
    const query: FilterQuery<ICrmActivity> = { deletedAt: { $ne: null, $lt: date } };
    const result = await CrmActivity.deleteMany(query).exec();
    return result.deletedCount;
  }

  /**
   * Bulk update many activities with a shared patch. Returns modifiedCount.
   * Date fields should already be Date objects on the caller side.
   */
  async bulkUpdate(
    ids: string[],
    data: Record<string, unknown>,
  ): Promise<number> {
    await this.ensureConnection();
    if (ids.length === 0) return 0;
    const result = await CrmActivity.updateMany(
      {
        _id: { $in: ids.map(id => new Types.ObjectId(id)) },
        deletedAt: null,
      },
      { $set: data },
    ).exec();
    return result.modifiedCount;
  }

  async markComplete(
    id: string,
    completedById: string
  ): Promise<ICrmActivity | null> {
    await this.ensureConnection();
    return CrmActivity.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          completed: true,
          completedAt: new Date(),
          completedById: new Types.ObjectId(completedById),
        },
      },
      { new: true }
    ).exec();
  }

  async markIncomplete(id: string): Promise<ICrmActivity | null> {
    await this.ensureConnection();
    return CrmActivity.findOneAndUpdate(
      { _id: id },
      {
        $set: { completed: false },
        $unset: { completedAt: 1, completedById: 1 },
      },
      { new: true }
    ).exec();
  }

  async togglePin(id: string): Promise<ICrmActivity | null> {
    await this.ensureConnection();
    const activity = await CrmActivity.findOne({ _id: id }).exec();
    if (!activity) return null;

    return CrmActivity.findOneAndUpdate(
      { _id: id },
      { $set: { isPinned: !activity.isPinned } },
      { new: true }
    ).exec();
  }

  async countByTarget(
    targetType: 'contact' | 'company' | 'deal',
    targetId: string
  ): Promise<number> {
    await this.ensureConnection();
    return CrmActivity.countDocuments({
      deletedAt: null,
      targetType,
      targetId: new Types.ObjectId(targetId),
    }).exec();
  }

  async findByContact(
    contactId: string,
    type?: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmActivity>> {
    return this.find({ contactId, ...(type ? { type: type as ActivityType } : {}) }, options);
  }

  async findByCompany(
    companyId: string,
    type?: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmActivity>> {
    return this.find({ companyId, ...(type ? { type: type as ActivityType } : {}) }, options);
  }

  async countOverdueTasks(assignedTo?: string): Promise<number> {
    await this.ensureConnection();
    const query: FilterQuery<ICrmActivity> = {
      deletedAt: null,
      type: 'task',
      completed: false,
      dueDate: { $lt: new Date() },
    };
    if (assignedTo) {
      query.assignedTo = new Types.ObjectId(assignedTo);
    }
    return CrmActivity.countDocuments(query).exec();
  }
}

export const activityRepository = new ActivityRepository();
