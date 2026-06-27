// OSS single-tenant override of src/lib/db/repository/crm/contact.repository.ts — generated CP-2 hand-patch; org-stripped, userId-scoped.
import mongoose, { FilterQuery, Types } from 'mongoose';
import CrmContact, { ICrmContact } from '../../models/crm/contact.model';
import { normalizeContactIdentityFields } from '@/lib/crm/contact-identity';

export interface CreateContactDto {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  emails?: ICrmContact['emails'];
  phones?: ICrmContact['phones'];
  avatar?: string;
  jobTitle?: string;
  department?: string;
  companyId?: string;
  channels?: ICrmContact['channels'];
  address?: ICrmContact['address'];
  source?: ICrmContact['source'];
  sourceDetails?: ICrmContact['sourceDetails'];
  status?: ICrmContact['status'];
  lifecycle?: ICrmContact['lifecycle'];
  rating?: ICrmContact['rating'];
  score?: number;
  tags?: string[];
  customFields?: Record<string, unknown>;
  ownerId?: string;
  socialProfiles?: ICrmContact['socialProfiles'];
  marketingConsent?: boolean;
  doNotContact?: boolean;
  notes?: ICrmContact['notes'];
  createdById: string;
}

export interface UpdateContactDto {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  emails?: ICrmContact['emails'];
  phones?: ICrmContact['phones'];
  avatar?: string;
  jobTitle?: string;
  department?: string;
  companyId?: string | null;
  channels?: ICrmContact['channels'];
  address?: ICrmContact['address'];
  source?: ICrmContact['source'];
  sourceDetails?: ICrmContact['sourceDetails'];
  status?: ICrmContact['status'];
  lifecycle?: ICrmContact['lifecycle'];
  rating?: ICrmContact['rating'];
  score?: number;
  tags?: string[];
  customFields?: Record<string, unknown>;
  ownerId?: string | null;
  socialProfiles?: ICrmContact['socialProfiles'];
  marketingConsent?: boolean;
  consentTimestamp?: Date;
  doNotContact?: boolean;
  notes?: ICrmContact['notes'];
}

export interface ContactFilters {
  search?: string;
  status?: ICrmContact['status'] | ICrmContact['status'][];
  lifecycle?: ICrmContact['lifecycle'];
  rating?: ICrmContact['rating'];
  ownerId?: string;
  companyId?: string;
  tags?: string[];
  source?: ICrmContact['source'];
  createdAfter?: Date;
  createdBefore?: Date;
  // Pre-built Mongo fragment from a saved view's nested filter tree.
  // ALWAYS merged via $and AFTER the mandatory soft-delete scope — never replaces it.
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

export class ContactRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmContact | null> {
    await this.ensureConnection();
    return CrmContact.findOne({ _id: id, deletedAt: null }).exec();
  }

  /** Like findById but includes soft-deleted rows — used by restore. */
  async findByIdIncludingDeleted(id: string): Promise<ICrmContact | null> {
    await this.ensureConnection();
    return CrmContact.findOne({ _id: id }).exec();
  }

  async findByEmail(email: string): Promise<ICrmContact | null> {
    await this.ensureConnection();
    const value = email.toLowerCase();
    // Match the scalar primary OR any secondary in the multi-value emails array.
    return CrmContact.findOne({
      deletedAt: null,
      $or: [{ email: value }, { 'emails.value': value }],
    }).exec();
  }

  /** Find by any phone value (primary scalar or any multi-value phone). */
  async findByPhone(phone: string): Promise<ICrmContact | null> {
    await this.ensureConnection();
    const normalized = phone.replace(/\D/g, '');
    const or: Record<string, unknown>[] = [{ phone }];
    if (normalized.length >= 7) {
      or.push({ phoneNormalized: normalized }, { 'phones.normalized': normalized });
    }
    return CrmContact.findOne({ deletedAt: null, $or: or }).exec();
  }

  async findByChannel(
    channelType: string,
    identifier: string
  ): Promise<ICrmContact | null> {
    await this.ensureConnection();
    return CrmContact.findOne({
      deletedAt: null,
      'channels.type': channelType,
      'channels.identifier': identifier,
    }).exec();
  }

  async find(
    filters: ContactFilters = {},
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmContact>> {
    await this.ensureConnection();

    const { page = 1, limit = 25, sort = 'createdAt', sortDirection = 'desc' } = options;
    const skip = (page - 1) * limit;

    const query: FilterQuery<ICrmContact> = { deletedAt: null };

    // Apply filters
    if (filters.search) {
      query.$text = { $search: filters.search };
    }
    if (filters.status) {
      query.status = Array.isArray(filters.status) ? { $in: filters.status } : filters.status;
    }
    if (filters.lifecycle) {
      query.lifecycle = filters.lifecycle;
    }
    if (filters.rating) {
      query.rating = filters.rating;
    }
    if (filters.ownerId) {
      query.ownerId = new Types.ObjectId(filters.ownerId);
    }
    if (filters.companyId) {
      query.companyId = new Types.ObjectId(filters.companyId);
    }
    if (filters.tags && filters.tags.length > 0) {
      query.tags = { $in: filters.tags.map(id => new Types.ObjectId(id)) };
    }
    if (filters.source) {
      query.source = filters.source;
    }
    if (filters.createdAfter || filters.createdBefore) {
      query.createdAt = {};
      if (filters.createdAfter) query.createdAt.$gte = filters.createdAfter;
      if (filters.createdBefore) query.createdAt.$lte = filters.createdBefore;
    }
    // Nested view filter tree — AND-ed on top of the mandatory soft-delete scope above.
    // deletedAt is set on `query` and cannot be overridden by the tree (which only
    // ever produces field conditions, never $and at root key).
    if (filters.filterTreeMongo) {
      query.$and = [...(query.$and ?? []), filters.filterTreeMongo as FilterQuery<ICrmContact>];
    }

    const sortObj: Record<string, 1 | -1> = { [sort]: sortDirection === 'asc' ? 1 : -1 };

    const [data, total] = await Promise.all([
      CrmContact.find(query).sort(sortObj).skip(skip).limit(limit).exec(),
      CrmContact.countDocuments(query).exec(),
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

  async findAll(query: Record<string, unknown> = {}): Promise<ICrmContact[]> {
    await this.ensureConnection();
    return CrmContact.find({ deletedAt: null, ...query }).exec();
  }

  async findOne(query: Record<string, unknown>): Promise<ICrmContact | null> {
    await this.ensureConnection();
    return CrmContact.findOne({ deletedAt: null, ...query }).exec();
  }

  /**
   * List query with sort + hard limit — used by the workflow `find_records`
   * node. `query` is a pre-built Mongo fragment (field conditions only); the
   * mandatory soft-delete scope is always applied on top and cannot be
   * overridden by the caller's fragment.
   */
  async findManyForAutomation(
    query: Record<string, unknown> = {},
    options: { sort?: Record<string, 1 | -1>; limit?: number } = {}
  ): Promise<ICrmContact[]> {
    await this.ensureConnection();
    const limit = Math.max(1, Math.min(options.limit ?? 100, 500));
    return CrmContact.find({ ...query, deletedAt: null })
      .sort(options.sort ?? { createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async create(data: CreateContactDto): Promise<ICrmContact> {
    await this.ensureConnection();

    const contact = new CrmContact({
      ...data,
      ...normalizeContactIdentityFields(data),
      companyId: data.companyId ? new Types.ObjectId(data.companyId) : undefined,
      tags: data.tags?.map(id => new Types.ObjectId(id)) || [],
      ownerId: data.ownerId ? new Types.ObjectId(data.ownerId) : undefined,
      createdById: new Types.ObjectId(data.createdById),
      assignedAt: data.ownerId ? new Date() : undefined,
    });

    return contact.save();
  }

  async update(
    id: string,
    data: UpdateContactDto
  ): Promise<ICrmContact | null> {
    await this.ensureConnection();

    const updateData: Record<string, unknown> = { ...data };

    // Sync multi-value emails/phones <-> scalar mirrors. Only touches identity
    // keys that are present in the payload, so partial updates are safe.
    Object.assign(updateData, normalizeContactIdentityFields(data));
    if (data.companyId !== undefined) {
      updateData.companyId = data.companyId ? new Types.ObjectId(data.companyId) : null;
    }
    if (data.tags) {
      updateData.tags = data.tags.map(id => new Types.ObjectId(id));
    }
    if (data.ownerId !== undefined) {
      updateData.ownerId = data.ownerId ? new Types.ObjectId(data.ownerId) : null;
      if (data.ownerId) updateData.assignedAt = new Date();
    }

    return CrmContact.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: updateData },
      { new: true }
    ).exec();
  }

  /** Soft delete — flags the contact as trashed; excluded from all default reads. */
  async softDelete(id: string, userId?: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmContact.updateOne(
      { _id: id, deletedAt: null },
      { $set: { deletedAt: new Date(), deletedById: userId ? new Types.ObjectId(userId) : undefined } }
    ).exec();
    return result.modifiedCount > 0;
  }

  /** Restore a soft-deleted contact. */
  async restore(id: string): Promise<ICrmContact | null> {
    await this.ensureConnection();
    return CrmContact.findOneAndUpdate(
      { _id: id, deletedAt: { $ne: null } },
      { $unset: { deletedAt: 1, deletedById: 1 } },
      { new: true }
    ).exec();
  }

  /** Hard delete (permanent). */
  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmContact.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  /** List trashed (soft-deleted) contacts for the trash view. */
  async listTrashed(
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmContact>> {
    await this.ensureConnection();
    const { page = 1, limit = 25 } = options;
    const skip = (page - 1) * limit;
    const query: FilterQuery<ICrmContact> = { deletedAt: { $ne: null } };
    const [data, total] = await Promise.all([
      CrmContact.find(query).sort({ deletedAt: -1 }).skip(skip).limit(limit).exec(),
      CrmContact.countDocuments(query).exec(),
    ]);
    return {
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total },
    };
  }

  /** Hard-delete trashed contacts older than `date`. */
  async purgeOlderThan(date: Date): Promise<number> {
    await this.ensureConnection();
    const query: FilterQuery<ICrmContact> = { deletedAt: { $ne: null, $lt: date } };
    const result = await CrmContact.deleteMany(query).exec();
    return result.deletedCount;
  }

  /** Soft delete many contacts in one round-trip. */
  async bulkSoftDelete(ids: string[], userId?: string): Promise<number> {
    await this.ensureConnection();
    if (ids.length === 0) return 0;
    const result = await CrmContact.updateMany(
      { _id: { $in: ids.map(id => new Types.ObjectId(id)) }, deletedAt: null },
      { $set: { deletedAt: new Date(), deletedById: userId ? new Types.ObjectId(userId) : undefined } }
    ).exec();
    return result.modifiedCount;
  }

  async bulkCreate(contacts: CreateContactDto[]): Promise<ICrmContact[]> {
    await this.ensureConnection();

    const docs = contacts.map(data => ({
      ...data,
      ...normalizeContactIdentityFields(data),
      companyId: data.companyId ? new Types.ObjectId(data.companyId) : undefined,
      tags: data.tags?.map(id => new Types.ObjectId(id)) || [],
      ownerId: data.ownerId ? new Types.ObjectId(data.ownerId) : undefined,
      createdById: new Types.ObjectId(data.createdById),
      assignedAt: data.ownerId ? new Date() : undefined,
    }));

    // @ts-expect-error
    return CrmContact.insertMany(docs);
  }

  async bulkUpdate(
    ids: string[],
    data: Partial<UpdateContactDto>
  ): Promise<number> {
    await this.ensureConnection();

    const updateData: Record<string, unknown> = { ...data };
    Object.assign(updateData, normalizeContactIdentityFields(data));
    if (data.tags) {
      updateData.tags = data.tags.map(id => new Types.ObjectId(id));
    }
    if (data.ownerId) {
      updateData.ownerId = new Types.ObjectId(data.ownerId);
      updateData.assignedAt = new Date();
    }

    const result = await CrmContact.updateMany(
      { _id: { $in: ids.map(id => new Types.ObjectId(id)) }, deletedAt: null },
      { $set: updateData }
    ).exec();

    return result.modifiedCount;
  }

  async bulkDelete(ids: string[]): Promise<number> {
    await this.ensureConnection();
    const result = await CrmContact.deleteMany({
      _id: { $in: ids.map(id => new Types.ObjectId(id)) },
    }).exec();
    return result.deletedCount;
  }

  async addTags(id: string, tagIds: string[]): Promise<ICrmContact | null> {
    await this.ensureConnection();
    return CrmContact.findOneAndUpdate(
      { _id: id },
      { $addToSet: { tags: { $each: tagIds.map(id => new Types.ObjectId(id)) } } },
      { new: true }
    ).exec();
  }

  async removeTags(id: string, tagIds: string[]): Promise<ICrmContact | null> {
    await this.ensureConnection();
    return CrmContact.findOneAndUpdate(
      { _id: id },
      { $pull: { tags: { $in: tagIds.map(id => new Types.ObjectId(id)) } } },
      { new: true }
    ).exec();
  }

  /** Bulk add tags to many contacts in a single round-trip. */
  async bulkAddTags(
    ids: string[],
    tagIds: string[],
  ): Promise<number> {
    await this.ensureConnection();
    if (ids.length === 0 || tagIds.length === 0) return 0;
    const result = await CrmContact.updateMany(
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

  /** Bulk remove tags from many contacts in a single round-trip. */
  async bulkRemoveTags(
    ids: string[],
    tagIds: string[],
  ): Promise<number> {
    await this.ensureConnection();
    if (ids.length === 0 || tagIds.length === 0) return 0;
    const result = await CrmContact.updateMany(
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

  async updateActivityStats(
    id: string,
    stats: { lastActivityAt?: Date; totalActivities?: number }
  ): Promise<void> {
    await this.ensureConnection();
    const update: Record<string, unknown> = {};
    if (stats.lastActivityAt) update.lastActivityAt = stats.lastActivityAt;
    if (stats.totalActivities !== undefined) update.totalActivities = stats.totalActivities;

    await CrmContact.updateOne({ _id: id }, { $set: update }).exec();
  }

  async incrementActivityCount(id: string): Promise<void> {
    await this.ensureConnection();
    await CrmContact.updateOne(
      { _id: id },
      { $inc: { totalActivities: 1 }, $set: { lastActivityAt: new Date() } }
    ).exec();
  }

  /** Count all (non-deleted) contacts in the workspace. */
  async countByOrganization(): Promise<number> {
    await this.ensureConnection();
    return CrmContact.countDocuments({ deletedAt: null }).exec();
  }

  async findByCompany(companyId: string): Promise<ICrmContact[]> {
    await this.ensureConnection();
    return CrmContact.find({ companyId, deletedAt: null }).exec();
  }
}

export const contactRepository = new ContactRepository();
