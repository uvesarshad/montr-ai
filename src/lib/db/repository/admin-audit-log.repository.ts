/**
 * Admin audit log repository.
 *
 * Writes are fire-and-forget: callers don't await the result, and errors are
 * logged but never propagate. The goal is observability, not transactional
 * integrity — losing the occasional audit row on a Mongo blip is acceptable.
 *
 * For *reading* (admin's "what changed when" view), use `list()`.
 */

import mongoose, { FilterQuery, Types } from 'mongoose';

import AdminAuditLog, {
  IAdminAuditLog,
  AdminAuditAction,
  AdminAuditEntity,
} from '../models/admin-audit-log.model';

async function ensureConnection(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();
  }
}

export interface RecordAuditInput {
  actorUserId: string;
  actorEmail?: string;
  entity: AdminAuditEntity;
  entityId?: string;
  action: AdminAuditAction;
  context?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export class AdminAuditLogRepository {
  /** Record one audit entry. Errors swallowed (logged) — never throws. */
  async record(input: RecordAuditInput): Promise<void> {
    try {
      await ensureConnection();
      await AdminAuditLog.create({
        actorUserId: new Types.ObjectId(input.actorUserId),
        actorEmail: input.actorEmail,
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        context: input.context ?? {},
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
    } catch (err) {
      console.error('[admin-audit] failed to record:', err);
    }
  }

  async list(
    filters: {
      entity?: AdminAuditEntity;
      entityId?: string;
      actorUserId?: string;
      action?: AdminAuditAction;
      since?: Date;
    } = {},
    pagination: { page?: number; limit?: number } = {},
  ): Promise<{ data: IAdminAuditLog[]; total: number }> {
    await ensureConnection();
    const { page = 1, limit = 50 } = pagination;
    const query: FilterQuery<IAdminAuditLog> = {};
    if (filters.entity) query.entity = filters.entity;
    if (filters.entityId) query.entityId = filters.entityId;
    if (filters.actorUserId) {
      query.actorUserId = new Types.ObjectId(filters.actorUserId);
    }
    if (filters.action) query.action = filters.action;
    if (filters.since) query.createdAt = { $gte: filters.since };

    const [data, total] = await Promise.all([
      AdminAuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      AdminAuditLog.countDocuments(query).exec(),
    ]);
    return { data, total };
  }
}

export const adminAuditLogRepository = new AdminAuditLogRepository();
