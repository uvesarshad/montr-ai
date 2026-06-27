import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type WorkflowTriggerType =
  | 'record_created'
  | 'record_updated'
  | 'field_changed'
  | 'stage_changed'
  | 'deal_won'
  | 'deal_lost'
  | 'tag_added'
  | 'tag_removed'
  | 'scheduled'
  | 'manual'
  | 'webhook_received';

export type WorkflowActionType =
  | 'update_field'
  | 'add_tag'
  | 'remove_tag'
  | 'assign_owner'
  | 'create_task'
  | 'create_activity'
  | 'send_email'
  | 'send_webhook'
  | 'send_whatsapp'
  | 'create_deal'
  | 'move_stage'
  | 'wait'
  | 'condition';

export interface IWorkflowTriggerConfig {
  field?: string;
  fromValue?: unknown;
  toValue?: unknown;
  stageId?: Types.ObjectId;
  tagId?: Types.ObjectId;
  schedule?: string; // Cron expression
  webhookPath?: string;
}

export interface IWorkflowTrigger {
  type: WorkflowTriggerType;
  entityType: 'contact' | 'company' | 'deal';
  config: IWorkflowTriggerConfig;
}

export interface IWorkflowCondition {
  field: string;
  operator: string;
  value: unknown;
  conjunction: 'and' | 'or';
}

export interface IWorkflowActionConfig {
  // For update_field
  field?: string;
  value?: unknown;
  // For add_tag/remove_tag
  tagId?: Types.ObjectId;
  // For assign_owner
  ownerId?: Types.ObjectId;
  assignmentType?: 'specific' | 'round_robin' | 'load_balanced';
  // For create_task
  subject?: string;
  dueInDays?: number;
  assignTo?: 'owner' | 'specific' | 'creator';
  assignToUserId?: Types.ObjectId;
  // For send_email
  templateId?: Types.ObjectId;
  body?: string;
  from?: string;
  // For send_webhook
  url?: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
  bodyTemplate?: string;
  // For send_whatsapp
  templateName?: string;
  templateParams?: string[];
  // For create_deal
  pipelineId?: Types.ObjectId;
  stageId?: Types.ObjectId;
  name?: string; // Template with variables
  // For move_stage
  // stageId already defined
  // For wait
  waitDays?: number;
  waitHours?: number;
  // For condition (branching)
  conditions?: IWorkflowCondition[];
  thenActions?: IWorkflowAction[];
  elseActions?: IWorkflowAction[];
}

export interface IWorkflowAction {
  type: WorkflowActionType;
  config: IWorkflowActionConfig;
}

export interface ICrmWorkflow extends Document {
  name: string;
  description?: string;
  isActive: boolean;

  // Trigger
  trigger: IWorkflowTrigger;

  // Conditions (filters to apply)
  conditions: IWorkflowCondition[];

  // Actions (what to do)
  actions: IWorkflowAction[];

  // Execution Settings
  runOnce: boolean;
  maxExecutions?: number;
  cooldownMinutes?: number;

  // Stats
  executionCount: number;
  lastExecutedAt?: Date;
  errorCount: number;

  /**
   * Set by `scripts/migrate-crm-workflows.ts` once this workflow has been
   * migrated to a UnifiedWorkflow. Presence makes the migration idempotent and
   * marks the legacy doc as wound-down.
   */
  migratedToUnifiedId?: Types.ObjectId;

  createdById: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WorkflowTriggerConfigSchema = new Schema({
  field: String,
  fromValue: Schema.Types.Mixed,
  toValue: Schema.Types.Mixed,
  stageId: Schema.Types.ObjectId,
  tagId: Schema.Types.ObjectId,
  schedule: String,
  webhookPath: String,
}, { _id: false });

const WorkflowTriggerSchema = new Schema({
  type: {
    type: String,
    enum: [
      'record_created', 'record_updated', 'field_changed', 'stage_changed',
      'deal_won', 'deal_lost', 'tag_added', 'tag_removed', 'scheduled',
      'manual', 'webhook_received'
    ],
    required: true,
  },
  entityType: {
    type: String,
    enum: ['contact', 'company', 'deal'],
    required: true,
  },
  config: WorkflowTriggerConfigSchema,
}, { _id: false });

const WorkflowConditionSchema = new Schema({
  field: {
    type: String,
    required: true,
  },
  operator: {
    type: String,
    required: true,
  },
  value: Schema.Types.Mixed,
  conjunction: {
    type: String,
    enum: ['and', 'or'],
    default: 'and',
  },
}, { _id: false });

const WorkflowActionConfigSchema = new Schema({
  field: String,
  value: Schema.Types.Mixed,
  tagId: Schema.Types.ObjectId,
  ownerId: Schema.Types.ObjectId,
  assignmentType: {
    type: String,
    enum: ['specific', 'round_robin', 'load_balanced'],
  },
  subject: String,
  dueInDays: Number,
  assignTo: {
    type: String,
    enum: ['owner', 'specific', 'creator'],
  },
  assignToUserId: Schema.Types.ObjectId,
  templateId: Schema.Types.ObjectId,
  body: String,
  from: String,
  url: String,
  method: {
    type: String,
    enum: ['POST', 'PUT'],
  },
  headers: Schema.Types.Mixed,
  bodyTemplate: String,
  templateName: String,
  templateParams: [String],
  pipelineId: Schema.Types.ObjectId,
  stageId: Schema.Types.ObjectId,
  name: String,
  waitDays: Number,
  waitHours: Number,
  conditions: [WorkflowConditionSchema],
  thenActions: { type: Array }, // Self-referencing
  elseActions: { type: Array }, // Self-referencing
}, { _id: false });

const WorkflowActionSchema = new Schema({
  type: {
    type: String,
    enum: [
      'update_field', 'add_tag', 'remove_tag', 'assign_owner', 'create_task',
      'create_activity', 'send_email', 'send_webhook', 'send_whatsapp',
      'create_deal', 'move_stage', 'wait', 'condition'
    ],
    required: true,
  },
  config: WorkflowActionConfigSchema,
}, { _id: false });

const CrmWorkflowSchema = new Schema<ICrmWorkflow>(
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
      default: false,
    },
    trigger: {
      type: WorkflowTriggerSchema,
      required: true,
    },
    conditions: {
      type: [WorkflowConditionSchema],
      default: [],
    },
    actions: {
      type: [WorkflowActionSchema],
      default: [],
    },
    runOnce: {
      type: Boolean,
      default: false,
    },
    maxExecutions: Number,
    cooldownMinutes: Number,
    executionCount: {
      type: Number,
      default: 0,
    },
    lastExecutedAt: Date,
    errorCount: {
      type: Number,
      default: 0,
    },
    migratedToUnifiedId: {
      type: Schema.Types.ObjectId,
      ref: 'UnifiedWorkflow',
    },
    createdById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'crm_workflows',
  }
);

// Indexes
CrmWorkflowSchema.index({ isActive: 1 });
CrmWorkflowSchema.index({ 'trigger.type': 1, 'trigger.entityType': 1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmWorkflow) {
    delete mongoose.models.CrmWorkflow;
  }
}

const CrmWorkflow: Model<ICrmWorkflow> =
  mongoose.models.CrmWorkflow || mongoose.model<ICrmWorkflow>('CrmWorkflow', CrmWorkflowSchema);

export default CrmWorkflow;
