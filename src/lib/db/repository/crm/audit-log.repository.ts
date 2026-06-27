import mongoose, { FilterQuery, Types } from 'mongoose';
import CrmAuditLog, { ICrmAuditLog, AuditAction, AuditSource, IAuditChange } from '../../models/crm/audit-log.model';

export interface CreateAuditLogDto {
  entityType: string;
  entityId: string;
  entityName?: string;
  action: AuditAction;
  changes?: IAuditChange[];
  source?: AuditSource;
  workflowId?: string;
  importId?: string;
  ipAddress?: string;
  userAgent?: string;
  userId?: string;
  userName?: string;
}

export interface AuditLogFilters {
  entityType?: string;
  entityId?: string;
  action?: AuditAction | AuditAction[];
  userId?: string;
  source?: AuditSource;
  changeField?: string;
  dateAfter?: Date;
  dateBefore?: Date;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
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

export class AuditLogRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmAuditLog | null> {
    await this.ensureConnection();
    return CrmAuditLog.findById(id).exec();
  }

  async find(
    filters: AuditLogFilters = {},
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmAuditLog>> {
    await this.ensureConnection();

    const { page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    const query: FilterQuery<ICrmAuditLog> = { };

    if (filters.entityType) {
      query.entityType = filters.entityType;
    }
    if (filters.entityId) {
      query.entityId = new Types.ObjectId(filters.entityId);
    }
    if (filters.action) {
      query.action = Array.isArray(filters.action) ? { $in: filters.action } : filters.action;
    }
    if (filters.userId) {
      query.userId = new Types.ObjectId(filters.userId);
    }
    if (filters.source) {
      query.source = filters.source;
    }
    if (filters.changeField) {
      query['changes.field'] = filters.changeField;
    }
    if (filters.dateAfter || filters.dateBefore) {
      query.createdAt = {};
      if (filters.dateAfter) query.createdAt.$gte = filters.dateAfter;
      if (filters.dateBefore) query.createdAt.$lte = filters.dateBefore;
    }

    const [data, total] = await Promise.all([
      CrmAuditLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      CrmAuditLog.countDocuments(query).exec(),
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

  async findByEntity(
    entityType: string,
    entityId: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmAuditLog>> {
    return this.find({ entityType, entityId }, options);
  }

  async findByUser(
    userId: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmAuditLog>> {
    return this.find({ userId }, options);
  }

  async create(data: CreateAuditLogDto): Promise<ICrmAuditLog> {
    await this.ensureConnection();

    const auditLog = new CrmAuditLog({
      entityType: data.entityType,
      entityId: new Types.ObjectId(data.entityId),
      entityName: data.entityName,
      action: data.action,
      changes: data.changes || [],
      source: data.source || 'ui',
      workflowId: data.workflowId ? new Types.ObjectId(data.workflowId) : undefined,
      importId: data.importId ? new Types.ObjectId(data.importId) : undefined,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      userId: data.userId ? new Types.ObjectId(data.userId) : undefined,
      userName: data.userName,
    });

    return auditLog.save();
  }

  async logCreate(
    entityType: string,
    entityId: string,
    entityName: string,
    userId: string,
    userName: string,
    source: AuditSource = 'ui',
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<ICrmAuditLog> {
    return this.create({
      entityType,
      entityId,
      entityName,
      action: 'created',
      source,
      userId,
      userName,
      ...metadata,
    });
  }

  async logUpdate(
    entityType: string,
    entityId: string,
    entityName: string,
    changes: IAuditChange[],
    userId: string,
    userName: string,
    source: AuditSource = 'ui',
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<ICrmAuditLog> {
    return this.create({
      entityType,
      entityId,
      entityName,
      action: 'updated',
      changes,
      source,
      userId,
      userName,
      ...metadata,
    });
  }

  async logDelete(
    entityType: string,
    entityId: string,
    entityName: string,
    userId: string,
    userName: string,
    source: AuditSource = 'ui',
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<ICrmAuditLog> {
    return this.create({
      entityType,
      entityId,
      entityName,
      action: 'deleted',
      source,
      userId,
      userName,
      ...metadata,
    });
  }

  async countByOrganization(): Promise<number> {
    await this.ensureConnection();
    return CrmAuditLog.countDocuments({ }).exec();
  }

  async countByAction(action: AuditAction): Promise<number> {
    await this.ensureConnection();
    return CrmAuditLog.countDocuments({ action }).exec();
  }

  // Helper to generate change objects
  static generateChanges(
    oldData: Record<string, unknown>,
    newData: Record<string, unknown>,
    _fieldLabels: Record<string, string> = {}
  ): IAuditChange[] {
    const changes: IAuditChange[] = [];

    const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

    for (const field of allKeys) {
      const oldValue = oldData[field];
      const newValue = newData[field];

      // Skip if values are the same
      if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;

      // Skip internal fields
      if (field.startsWith('_') || ['createdAt', 'updatedAt'].includes(field)) continue;

      changes.push({
        field,
        oldValue,
        newValue,
        displayOld: AuditLogRepository.formatValue(oldValue),
        displayNew: AuditLogRepository.formatValue(newValue),
      });
    }

    return changes;
  }

  private static formatValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}

export const auditLogRepository = new AuditLogRepository();
