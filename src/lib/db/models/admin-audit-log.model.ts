/**
 * Admin audit log — platform-scoped (super-admin) actions.
 *
 * Distinct from `crm_audit_logs` which is org-scoped to CRM record changes.
 * This table records super-admin operations across the platform: voice
 * provider config CRUD, AI provider config CRUD, plan edits, etc. B2 (AI
 * provider config) and B3 (voice provider config) both write here.
 *
 * Schema is intentionally generic so future admin features piggyback without
 * model changes.
 */

import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type AdminAuditEntity =
  | 'voice_provider_config'
  | 'voice_phone_number'
  | 'ai_provider_config'
  | 'plan'
  | 'system_setting'
  | 'user_role'
  | 'ai_bot';

export type AdminAuditAction =
  | 'create'
  | 'update'
  | 'enable'
  | 'disable'
  | 'delete'
  | 'test'
  | 'rotate'
  | 'login';

export interface IAdminAuditLog extends Document {
  actorUserId: Types.ObjectId;
  /** Email at time of action (for searchability even if user is later deleted). */
  actorEmail?: string;
  entity: AdminAuditEntity;
  entityId?: string;
  action: AdminAuditAction;
  /** Free-form context — the action's parameters minus secrets. */
  context: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const AdminAuditLogSchema = new Schema<IAdminAuditLog>(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorEmail: { type: String },
    entity: { type: String, required: true, index: true },
    entityId: { type: String, index: true },
    action: { type: String, required: true, index: true },
    context: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'admin_audit_logs',
  },
);

AdminAuditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
AdminAuditLogSchema.index({ actorUserId: 1, createdAt: -1 });
AdminAuditLogSchema.index({ createdAt: -1 });

if (process.env.NODE_ENV === 'development' && mongoose.models.AdminAuditLog) {
  delete mongoose.models.AdminAuditLog;
}

const AdminAuditLog: Model<IAdminAuditLog> =
  mongoose.models.AdminAuditLog
  || mongoose.model<IAdminAuditLog>('AdminAuditLog', AdminAuditLogSchema);

export default AdminAuditLog;
