// OSS single-tenant override of src/lib/db/repository/crm/company.repository.ts — generated CP-2 hand-patch; org-stripped, userId-scoped.
import mongoose, { FilterQuery, Types } from 'mongoose';
import CrmCompany, { ICrmCompany } from '../../models/crm/company.model';

export interface CreateCompanyDto {
  name: string;
  domain?: string;
  website?: string;
  logo?: string;
  description?: string;
  industry?: string;
  type?: ICrmCompany['type'];
  size?: ICrmCompany['size'];
  annualRevenue?: number;
  employeeCount?: number;
  address?: ICrmCompany['address'];
  phone?: string;
  email?: string;
  socialProfiles?: ICrmCompany['socialProfiles'];
  tags?: string[];
  customFields?: Record<string, unknown>;
  ownerId?: string;
  notes?: ICrmCompany['notes'];
  createdById: string;
}

export interface UpdateCompanyDto {
  name?: string;
  domain?: string;
  website?: string;
  logo?: string;
  description?: string;
  industry?: string;
  type?: ICrmCompany['type'];
  size?: ICrmCompany['size'];
  annualRevenue?: number;
  employeeCount?: number;
  address?: ICrmCompany['address'];
  phone?: string;
  email?: string;
  socialProfiles?: ICrmCompany['socialProfiles'];
  tags?: string[];
  customFields?: Record<string, unknown>;
  ownerId?: string | null;
  notes?: ICrmCompany['notes'];
}

export interface CompanyFilters {
  search?: string;
  type?: ICrmCompany['type'] | ICrmCompany['type'][];
  industry?: string;
  size?: ICrmCompany['size'];
  ownerId?: string;
  tags?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  // Pre-built Mongo fragment from a saved view's nested filter tree.
  // ALWAYS merged via $and AFTER the mandatory soft-delete scope.
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

export class CompanyRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmCompany | null> {
    await this.ensureConnection();
    return CrmCompany.findOne({ _id: id, deletedAt: null }).exec();
  }

  /** Like findById but includes soft-deleted rows — used by restore. */
  async findByIdIncludingDeleted(id: string): Promise<ICrmCompany | null> {
    await this.ensureConnection();
    return CrmCompany.findOne({ _id: id }).exec();
  }

  async findByDomain(domain: string): Promise<ICrmCompany | null> {
    await this.ensureConnection();
    return CrmCompany.findOne({ domain: domain.toLowerCase(), deletedAt: null }).exec();
  }

  async findByName(name: string): Promise<ICrmCompany | null> {
    await this.ensureConnection();
    return CrmCompany.findOne({ name, deletedAt: null }).exec();
  }

  async find(
    filters: CompanyFilters = {},
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmCompany>> {
    await this.ensureConnection();

    const { page = 1, limit = 25, sort = 'createdAt', sortDirection = 'desc' } = options;
    const skip = (page - 1) * limit;

    const query: FilterQuery<ICrmCompany> = { deletedAt: null };

    if (filters.search) {
      query.$text = { $search: filters.search };
    }
    if (filters.type) {
      query.type = Array.isArray(filters.type) ? { $in: filters.type } : filters.type;
    }
    if (filters.industry) {
      query.industry = filters.industry;
    }
    if (filters.size) {
      query.size = filters.size;
    }
    if (filters.ownerId) {
      query.ownerId = new Types.ObjectId(filters.ownerId);
    }
    if (filters.tags && filters.tags.length > 0) {
      query.tags = { $in: filters.tags.map(id => new Types.ObjectId(id)) };
    }
    if (filters.createdAfter || filters.createdBefore) {
      query.createdAt = {};
      if (filters.createdAfter) query.createdAt.$gte = filters.createdAfter;
      if (filters.createdBefore) query.createdAt.$lte = filters.createdBefore;
    }
    if (filters.filterTreeMongo) {
      query.$and = [...(query.$and ?? []), filters.filterTreeMongo as FilterQuery<ICrmCompany>];
    }

    const sortObj: Record<string, 1 | -1> = { [sort]: sortDirection === 'asc' ? 1 : -1 };

    const [data, total] = await Promise.all([
      CrmCompany.find(query).sort(sortObj).skip(skip).limit(limit).exec(),
      CrmCompany.countDocuments(query).exec(),
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

  async findAll(query: Record<string, unknown> = {}): Promise<ICrmCompany[]> {
    await this.ensureConnection();
    return CrmCompany.find({ deletedAt: null, ...query }).exec();
  }

  async findOne(query: Record<string, unknown>): Promise<ICrmCompany | null> {
    await this.ensureConnection();
    return CrmCompany.findOne({ deletedAt: null, ...query }).exec();
  }

  /**
   * List query with sort + hard limit — used by the workflow `find_records`
   * node. Soft-delete scope always applied on top of `query`.
   */
  async findManyForAutomation(
    query: Record<string, unknown> = {},
    options: { sort?: Record<string, 1 | -1>; limit?: number } = {}
  ): Promise<ICrmCompany[]> {
    await this.ensureConnection();
    const limit = Math.max(1, Math.min(options.limit ?? 100, 500));
    return CrmCompany.find({ ...query, deletedAt: null })
      .sort(options.sort ?? { createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async create(data: CreateCompanyDto): Promise<ICrmCompany> {
    await this.ensureConnection();

    const company = new CrmCompany({
      ...data,
      domain: data.domain?.toLowerCase(),
      email: data.email?.toLowerCase(),
      tags: data.tags?.map(id => new Types.ObjectId(id)) || [],
      ownerId: data.ownerId ? new Types.ObjectId(data.ownerId) : undefined,
      createdById: new Types.ObjectId(data.createdById),
      assignedAt: data.ownerId ? new Date() : undefined,
    });

    return company.save();
  }

  async update(
    id: string,
    data: UpdateCompanyDto
  ): Promise<ICrmCompany | null> {
    await this.ensureConnection();

    const updateData: Record<string, unknown> = { ...data };

    if (data.domain) updateData.domain = data.domain.toLowerCase();
    if (data.email) updateData.email = data.email.toLowerCase();
    if (data.tags) {
      updateData.tags = data.tags.map(id => new Types.ObjectId(id));
    }
    if (data.ownerId !== undefined) {
      updateData.ownerId = data.ownerId ? new Types.ObjectId(data.ownerId) : null;
      if (data.ownerId) updateData.assignedAt = new Date();
    }

    return CrmCompany.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: updateData },
      { new: true }
    ).exec();
  }

  /** Soft delete — flags the company as trashed. Contacts/deals keep their companyId. */
  async softDelete(id: string, userId?: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmCompany.updateOne(
      { _id: id, deletedAt: null },
      { $set: { deletedAt: new Date(), deletedById: userId ? new Types.ObjectId(userId) : undefined } }
    ).exec();
    return result.modifiedCount > 0;
  }

  async restore(id: string): Promise<ICrmCompany | null> {
    await this.ensureConnection();
    return CrmCompany.findOneAndUpdate(
      { _id: id, deletedAt: { $ne: null } },
      { $unset: { deletedAt: 1, deletedById: 1 } },
      { new: true }
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmCompany.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  /** Bulk soft delete companies in one round-trip. */
  async bulkSoftDelete(ids: string[], userId?: string): Promise<number> {
    await this.ensureConnection();
    if (ids.length === 0) return 0;
    const result = await CrmCompany.updateMany(
      { _id: { $in: ids.map(id => new Types.ObjectId(id)) }, deletedAt: null },
      { $set: { deletedAt: new Date(), deletedById: userId ? new Types.ObjectId(userId) : undefined } }
    ).exec();
    return result.modifiedCount;
  }

  async listTrashed(
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmCompany>> {
    await this.ensureConnection();
    const { page = 1, limit = 25 } = options;
    const skip = (page - 1) * limit;
    const query: FilterQuery<ICrmCompany> = { deletedAt: { $ne: null } };
    const [data, total] = await Promise.all([
      CrmCompany.find(query).sort({ deletedAt: -1 }).skip(skip).limit(limit).exec(),
      CrmCompany.countDocuments(query).exec(),
    ]);
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total },
    };
  }

  async purgeOlderThan(date: Date): Promise<number> {
    await this.ensureConnection();
    const query: FilterQuery<ICrmCompany> = { deletedAt: { $ne: null, $lt: date } };
    const result = await CrmCompany.deleteMany(query).exec();
    return result.deletedCount;
  }

  async updateMetrics(
    id: string,
    metrics: {
      contactCount?: number;
      dealCount?: number;
      totalDealValue?: number;
      wonDealValue?: number;
      lastActivityAt?: Date;
      totalActivities?: number;
    }
  ): Promise<void> {
    await this.ensureConnection();
    await CrmCompany.updateOne(
      { _id: id },
      { $set: metrics }
    ).exec();
  }

  async incrementContactCount(id: string, amount: number = 1): Promise<void> {
    await this.ensureConnection();
    await CrmCompany.updateOne(
      { _id: id },
      { $inc: { contactCount: amount } }
    ).exec();
  }

  async incrementDealCount(id: string, amount: number = 1): Promise<void> {
    await this.ensureConnection();
    await CrmCompany.updateOne(
      { _id: id },
      { $inc: { dealCount: amount } }
    ).exec();
  }

  async addTags(id: string, tagIds: string[]): Promise<ICrmCompany | null> {
    await this.ensureConnection();
    return CrmCompany.findOneAndUpdate(
      { _id: id },
      { $addToSet: { tags: { $each: tagIds.map(id => new Types.ObjectId(id)) } } },
      { new: true }
    ).exec();
  }

  async removeTags(id: string, tagIds: string[]): Promise<ICrmCompany | null> {
    await this.ensureConnection();
    return CrmCompany.findOneAndUpdate(
      { _id: id },
      { $pull: { tags: { $in: tagIds.map(id => new Types.ObjectId(id)) } } },
      { new: true }
    ).exec();
  }

  /** Bulk add tags to many companies in one round-trip. */
  async bulkAddTags(
    ids: string[],
    tagIds: string[],
  ): Promise<number> {
    await this.ensureConnection();
    if (ids.length === 0 || tagIds.length === 0) return 0;
    const result = await CrmCompany.updateMany(
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

  /** Bulk remove tags from many companies in one round-trip. */
  async bulkRemoveTags(
    ids: string[],
    tagIds: string[],
  ): Promise<number> {
    await this.ensureConnection();
    if (ids.length === 0 || tagIds.length === 0) return 0;
    const result = await CrmCompany.updateMany(
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

  async countByOrganization(): Promise<number> {
    await this.ensureConnection();
    return CrmCompany.countDocuments({ deletedAt: null }).exec();
  }
}

export const companyRepository = new CompanyRepository();
