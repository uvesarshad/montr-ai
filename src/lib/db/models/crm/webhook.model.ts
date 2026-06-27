import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type WebhookEvent =
  // Contact events
  | 'contact.created'
  | 'contact.updated'
  | 'contact.deleted'
  // Company events
  | 'company.created'
  | 'company.updated'
  | 'company.deleted'
  // Deal events
  | 'deal.created'
  | 'deal.updated'
  | 'deal.deleted'
  | 'deal.stage_changed'
  | 'deal.won'
  | 'deal.lost'
  // Activity events
  | 'activity.created'
  | 'task.completed'
  // Email events
  | 'email.received'
  | 'email.sent';

export interface IWebhookFilter {
  field: string;
  operator: string;
  value?: unknown;
}

export interface ICrmWebhook extends Document {
  name: string;
  description?: string;
  isActive: boolean;

  // Target
  url: string;
  method: 'POST' | 'PUT' | 'PATCH';
  headers: Record<string, string>;
  secret?: string; // Signing secret for verification

  // Events to trigger on
  events: WebhookEvent[];

  // Filters (optional)
  filters: IWebhookFilter[];

  // Retry Settings
  maxRetries: number;
  retryDelaySeconds: number;

  // Stats
  deliveryCount: number;
  failureCount: number;
  lastDeliveredAt?: Date;
  lastFailedAt?: Date;
  lastError?: string;

  createdById: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookFilterSchema = new Schema({
  field: {
    type: String,
    required: true,
  },
  operator: {
    type: String,
    required: true,
  },
  value: Schema.Types.Mixed,
}, { _id: false });

const CrmWebhookSchema = new Schema<ICrmWebhook>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    url: {
      type: String,
      required: true,
    },
    method: {
      type: String,
      enum: ['POST', 'PUT', 'PATCH'],
      default: 'POST',
    },
    headers: {
      type: Schema.Types.Mixed,
      default: {},
    },
    secret: {
      type: String,
    },
    events: [{
      type: String,
      enum: [
        'contact.created', 'contact.updated', 'contact.deleted',
        'company.created', 'company.updated', 'company.deleted',
        'deal.created', 'deal.updated', 'deal.deleted', 'deal.stage_changed', 'deal.won', 'deal.lost',
        'activity.created', 'task.completed',
        'email.received', 'email.sent'
      ],
    }],
    filters: {
      type: [WebhookFilterSchema],
      default: [],
    },
    maxRetries: {
      type: Number,
      default: 3,
    },
    retryDelaySeconds: {
      type: Number,
      default: 60,
    },
    deliveryCount: {
      type: Number,
      default: 0,
    },
    failureCount: {
      type: Number,
      default: 0,
    },
    lastDeliveredAt: Date,
    lastFailedAt: Date,
    lastError: String,
    createdById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'crm_webhooks',
  }
);

// Indexes
CrmWebhookSchema.index({ isActive: 1 });
CrmWebhookSchema.index({ events: 1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmWebhook) {
    delete mongoose.models.CrmWebhook;
  }
}

const CrmWebhook: Model<ICrmWebhook> =
  mongoose.models.CrmWebhook || mongoose.model<ICrmWebhook>('CrmWebhook', CrmWebhookSchema);

export default CrmWebhook;

// Webhook Delivery Log Model (separate collection)
export interface ICrmWebhookLog extends Document {
  webhookId: Types.ObjectId;
  event: string;
  payload: Record<string, unknown>;
  statusCode?: number;
  response?: string;
  success: boolean;
  attemptNumber: number;
  createdAt: Date;
}

const CrmWebhookLogSchema = new Schema<ICrmWebhookLog>(
  {
    webhookId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmWebhook',
      required: true,
      index: true,
    },
    event: {
      type: String,
      required: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    statusCode: Number,
    response: String,
    success: {
      type: Boolean,
      required: true,
    },
    attemptNumber: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'crm_webhook_logs',
  }
);

// Indexes
CrmWebhookLogSchema.index({ webhookId: 1, createdAt: -1 });
CrmWebhookLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // 30 days TTL

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmWebhookLog) {
    delete mongoose.models.CrmWebhookLog;
  }
}

export const CrmWebhookLog: Model<ICrmWebhookLog> =
  mongoose.models.CrmWebhookLog || mongoose.model<ICrmWebhookLog>('CrmWebhookLog', CrmWebhookLogSchema);
