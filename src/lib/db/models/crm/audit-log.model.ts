import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type AuditAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'restored'
  | 'merged'
  | 'imported'
  | 'exported'
  | 'login'
  | 'logout';

export type AuditSource =
  | 'ui'
  | 'api'
  | 'import'
  | 'workflow'
  | 'sync'
  | 'system';

export interface IAuditChange {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
  displayOld?: string;
  displayNew?: string;
}

export interface ICrmAuditLog extends Document {
  // What changed
  entityType: string;
  entityId: Types.ObjectId;
  entityName?: string;

  // Change details
  action: AuditAction;
  changes: IAuditChange[];

  // Context
  source: AuditSource;
  workflowId?: Types.ObjectId;
  importId?: Types.ObjectId;
  ipAddress?: string;
  userAgent?: string;

  // Who
  userId?: Types.ObjectId;
  userName?: string;

  createdAt: Date;
}

const AuditChangeSchema = new Schema({
  field: {
    type: String,
    required: true,
  },
  oldValue: Schema.Types.Mixed,
  newValue: Schema.Types.Mixed,
  displayOld: String,
  displayNew: String,
}, { _id: false });

const CrmAuditLogSchema = new Schema<ICrmAuditLog>(
  {
    entityType: {
      type: String,
      required: true,
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    entityName: String,
    action: {
      type: String,
      enum: ['created', 'updated', 'deleted', 'restored', 'merged', 'imported', 'exported', 'login', 'logout'],
      required: true,
    },
    changes: {
      type: [AuditChangeSchema],
      default: [],
    },
    source: {
      type: String,
      enum: ['ui', 'api', 'import', 'workflow', 'sync', 'system'],
      default: 'ui',
    },
    workflowId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmWorkflow',
    },
    importId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmImport',
    },
    ipAddress: String,
    userAgent: String,
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    userName: String,
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'crm_audit_logs',
  }
);

// Indexes
CrmAuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
CrmAuditLogSchema.index({ userId: 1, createdAt: -1 });
CrmAuditLogSchema.index({ action: 1, createdAt: -1 });

// TTL index - auto-delete after 365 days
CrmAuditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmAuditLog) {
    delete mongoose.models.CrmAuditLog;
  }
}

const CrmAuditLog: Model<ICrmAuditLog> =
  mongoose.models.CrmAuditLog || mongoose.model<ICrmAuditLog>('CrmAuditLog', CrmAuditLogSchema);

export default CrmAuditLog;
