import mongoose, { Schema, Document, Model, Types } from 'mongoose';

/**
 * Unified Workflow Model
 *
 * Combines CRM, WhatsApp, and Marketing Email workflows into a single system
 * with advanced features like variables, templates, and sophisticated execution.
 */

// ============================================
// VARIABLE SYSTEM
// ============================================

export enum VariableType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  DATE = 'date',
  OBJECT = 'object',
  ARRAY = 'array',
  ANY = 'any'
}

export enum VariableScope {
  GLOBAL = 'global',        // Accessible across all workflows
  WORKFLOW = 'workflow',    // Scoped to one workflow
  EXECUTION = 'execution',  // Runtime only, not persisted
  NODE = 'node'             // Output of a specific node
}

export interface IWorkflowVariable {
  key: string;              // e.g., "userEmail", "orderTotal"
  label: string;            // Human-readable name
  type: VariableType;
  scope: VariableScope;
  value?: unknown;              // Default/initial value
  description?: string;
}

// ============================================
// NODE SYSTEM
// ============================================

export type NodeType =
  | 'trigger'      // Start points
  | 'action'       // Actions (send message, update field, etc.)
  | 'logic'        // Conditional logic, branches
  | 'ai'           // AI operations
  | 'data'         // Data operations
  | 'integration'  // External integrations
  | 'control';     // Control flow (delay, wait, loop)

export type TriggerSubType =
  | 'message_received'       // WhatsApp message
  | 'keyword_match'          // Specific keywords on an inbound message
  | 'keyword_monitor'        // Brand / topic mention monitor across web / social / news
  | 'email_received'         // Inbound email at a connected mailbox
  | 'email_opened'           // Marketing email opened
  | 'email_clicked'          // Marketing email link clicked
  | 'telegram_message'       // Inbound Telegram bot message
  | 'social_event'           // Mention / comment / DM / new follower / like across socials
  | 'record_created'         // CRM record created
  | 'record_updated'         // CRM record updated
  | 'field_changed'          // Specific field changed
  | 'stage_changed'          // Deal stage changed
  | 'tag_added'              // Tag added to record
  | 'tag_removed'            // Tag removed
  | 'record_deleted'         // CRM record deleted
  | 'deal_won'               // Deal marked as won
  | 'deal_lost'              // Deal marked as lost
  | 'task_completed'         // CRM task completed
  | 'scheduled'              // Time-based trigger (cron)
  | 'manual'                 // Manual trigger
  | 'webhook'                // External webhook
  // Voice triggers — reserved for Bundle 3 (V-6.1, V-6.2)
  | 'call_completed'
  | 'call_inbound'
  // AI bot triggers — B3-4.5.8 request; processors land alongside B3's Phase 5 cross-cutting
  | 'ai_bot.conversation_ended'
  | 'ai_bot.escalation_requested'
  // Integrations hub — inbound provider webhooks (Shopify, RevenueCat)
  | 'integration_webhook'
  // Ads — lead captured from Meta Lead Ads / Google lead forms
  | 'ad_lead_captured'
  // Ads — performance signals fired by the source-metrics worker
  | 'ads_budget_threshold'      // spend pacing crossed a configured threshold
  | 'ads_performance_anomaly'   // computed WoW spend swing breached the anomaly band
  | 'ads_weekly_summary'        // weekly computed spend/clicks/conversions roll-up
  // Forms — a hosted/public form submission landed
  | 'form_submission'
  // Polling — periodically poll an app for new items (Gmail email, Sheets row, RSS item)
  // when no webhook exists. Diffed against a per-workflow cursor (H5).
  | 'polling';

export type ActionSubType =
  // WhatsApp Actions
  | 'send_whatsapp_text'
  | 'send_whatsapp_image'
  | 'send_whatsapp_video'
  | 'send_whatsapp_pdf'
  | 'send_whatsapp_template'
  | 'send_whatsapp_buttons'
  | 'send_whatsapp_list'
  // CRM Actions
  | 'create_contact'
  | 'update_contact'
  | 'create_deal'
  | 'update_deal'
  | 'move_stage'
  | 'assign_owner'
  | 'add_tag'
  | 'remove_tag'
  | 'create_activity'
  | 'create_task'
  | 'log_note'
  | 'find_record'
  | 'delete_record'
  // Email Actions
  | 'send_marketing_email'
  | 'send_conversational_email'
  | 'add_to_campaign'
  | 'remove_from_campaign'
  // Social Actions
  | 'publish_social'
  | 'instagram_dm'
  // Telegram Actions
  | 'send_telegram'
  // Inbox Actions (Bundle 3 inbox surface)
  | 'assign_to_agent'
  | 'assign_to_group'
  | 'assign_ai_bot_to_conversation'
  // Channel-aware (Bundle 3 social-bridge / identity resolver)
  | 'send_channel_message'
  // Voice Actions — reserved for Bundle 3 (V-6.3)
  | 'make_outbound_call'
  // General Actions
  | 'send_webhook'
  | 'http_request';

export type LogicSubType =
  | 'branch'           // If/else conditional
  | 'switch'           // Multiple conditions
  | 'filter'           // Filter data
  | 'router';          // Route to multiple paths

export type AISubType =
  | 'generate_text'    // Generate text with AI
  | 'generate_image'   // Generate image with AI
  | 'analyze_sentiment' // Analyze sentiment
  | 'extract_entities'  // Extract entities (NER)
  | 'classify_intent'   // Classify user intent
  | 'knowledge_base';   // Query knowledge base

export type DataSubType =
  | 'transform'             // Transform data
  | 'aggregate'             // Aggregate data
  | 'set_variable'          // Set variable value
  | 'get_variable'          // Get variable value
  | 'counter'               // Increment / decrement a numeric variable (migrated from whatsapp-workflow)
  | 'query_database'        // Query database
  | 'query_knowledge_base'  // Semantic search over an AI knowledge base
  | 'identity_resolve';     // Phone/email/handle → CRM contact (Bundle 3, X2)

export type ControlSubType =
  | 'delay'                       // Delay execution
  | 'wait_for'                    // Wait for condition
  | 'wait_for_channel_response'   // Pause until reply on any channel (Bundle 3 social-bridge)
  | 'wait_for_call_response'      // Pause until inbound call from contact (Bundle 3, V-6.4)
  | 'form_input'                  // Pause for a human to submit a form (Twenty-style)
  | 'loop'                        // Loop over array
  | 'parallel'                    // Execute in parallel
  | 'end';                        // End execution

export interface IWorkflowNode {
  id: string;
  type: NodeType;
  subType: string; // One of the *SubType unions
  position: {
    x: number;
    y: number;
  };
  data: {
    label?: string;
    description?: string;
    config: Record<string, unknown>; // Node-specific configuration
    inputs?: Record<string, unknown>; // Input variables
    outputs?: Record<string, unknown>; // Output variables
  };
}

export interface IWorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  condition?: string; // Expression for conditional edges
}

// ============================================
// TRIGGER SYSTEM
// ============================================

export interface ITriggerConfig {
  // Message triggers
  keywords?: string[];
  matchType?: 'exact' | 'contains' | 'regex';
  caseSensitive?: boolean;

  // CRM triggers
  entityType?: 'contact' | 'company' | 'deal';
  field?: string;
  fromValue?: unknown;
  toValue?: unknown;
  stageId?: Types.ObjectId;
  tagId?: Types.ObjectId;

  // Scheduled triggers
  cronExpression?: string;
  timezone?: string;
  isRecurring?: boolean;

  // Webhook triggers
  webhookPath?: string;
  webhookSecret?: string;
  /** Opt-in replay protection: when true, the canvas-webhook receiver requires
   *  a fresh `X-Timestamp` header (±5 min) on each delivery. Off by default so
   *  existing senders keep working. */
  webhookRequireTimestamp?: boolean;

  // Filters
  contactFilter?: Record<string, unknown>;
  accountId?: Types.ObjectId;

  // Polling triggers (H5) — "when a new row/email/record appears".
  /** Which source to poll. */
  pollSource?: 'gmail_new_email' | 'sheets_new_row' | 'rss_new_item';
  /** How often to poll, in minutes (min 5, default 15). */
  intervalMinutes?: number;
  /**
   * Credential / connection reference. For Gmail/Sheets this is the name of a
   * workflow credential vault entry holding the Google OAuth access token (same
   * key the google_workspace node uses). Not required for RSS.
   */
  connectionId?: string;
  // Sheets-specific
  spreadsheetId?: string;
  sheetName?: string;
  // RSS-specific (user-supplied URL — always fetched via safeOutboundFetch)
  feedUrl?: string;
  // Gmail-specific (optional narrowing)
  gmailQuery?: string;
  gmailLabelId?: string;
}

export interface IWorkflowTrigger {
  type: TriggerSubType;
  config: ITriggerConfig;
}

// ============================================
// EXECUTION SYSTEM
// ============================================

export interface IExecutionStep {
  nodeId: string;
  nodeName?: string;
  timestamp: Date;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'pinned';
  input?: unknown;           // Input data to the node
  output?: unknown;          // Output data from the node
  error?: string;
  errorStack?: string;
  duration?: number;     // milliseconds
  retryCount?: number;
  variables?: Record<string, unknown>; // Variable state after this step
}

export enum ExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
  CANCELLED = 'cancelled'
}

// ============================================
// CREDENTIALS SYSTEM
// ============================================

export interface IEncryptedCredential {
  name: string;
  type: 'api_key' | 'oauth' | 'basic_auth' | 'custom';
  encryptedValue: string;  // AES-256-GCM encrypted
  iv: string;              // Initialization vector
  authTag: string;         // Authentication tag
  salt: string;            // PBKDF2 salt — required to derive the key on decrypt
  metadata?: Record<string, unknown>;
}

// ============================================
// ERROR HANDLING
// ============================================

export interface IErrorHandling {
  retryEnabled: boolean;
  maxRetries: number;
  retryDelay: number;      // milliseconds
  retryBackoff: 'linear' | 'exponential';
  onErrorAction?: 'continue' | 'stop' | 'retry' | 'fallback';
  fallbackNodeId?: string;
}

// ============================================
// MAIN WORKFLOW MODEL
// ============================================

export enum WorkflowType {
  WHATSAPP = 'whatsapp',
  CRM = 'crm',
  MARKETING_EMAIL = 'marketing_email',
  UNIFIED = 'unified'  // Can use features from all
}

export enum WorkflowStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ARCHIVED = 'archived'
}

export interface IUnifiedWorkflow extends Document {
  // Identification
  name: string;
  description?: string;
  type: WorkflowType;
  status: WorkflowStatus;

  // Ownership
  /** Agency mode (B2-5.4) — brand-scoped workflows. Optional during rollout; queries fall through to organization scope when absent. */
  brandId?: Types.ObjectId;
  createdById: Types.ObjectId;
  canvasId?: Types.ObjectId;

  // Workflow Definition
  trigger: IWorkflowTrigger;
  nodes: IWorkflowNode[];
  edges: IWorkflowEdge[];
  variables: IWorkflowVariable[];

  // Error Handling
  errorHandling: IErrorHandling;

  // Credentials
  credentials: IEncryptedCredential[];

  // Execution Settings
  runOnce: boolean;
  maxExecutions?: number;
  cooldownMinutes?: number;
  /** Last time a trigger dispatch enqueued an execution — drives cooldown guard. */
  lastTriggeredAt?: Date;
  timeout?: number;        // Max execution time in seconds

  // Advanced Features
  enableParallel: boolean;  // Allow parallel execution
  enableLoops: boolean;     // Allow loop nodes

  // Stats
  executionCount: number;
  successCount: number;
  failureCount: number;
  lastExecutedAt?: Date;
  lastExecutionStatus?: ExecutionStatus;
  avgExecutionTime?: number; // milliseconds

  // Template
  isTemplate: boolean;
  templateCategory?: string;
  templateTags?: string[];
  templateAuthor?: string;
  templateVersion?: number;
  installCount?: number;
  rating?: number;

  // Version Control
  version: number;

  // Migration provenance (set when a doc is generated by the consolidation migrators).
  // Used for idempotency and revert. Absent on hand-built workflows.
  migrationMetadata?: {
    sourceSystem: 'crm_workflow' | 'whatsapp_workflow';
    sourceId: Types.ObjectId;
    migratedAt: Date;
    migratorVersion: number;
  };

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Methods
  activate(): Promise<IUnifiedWorkflow>;
  deactivate(): Promise<IUnifiedWorkflow>;
  incrementExecutionCount(success: boolean, duration?: number): Promise<IUnifiedWorkflow>;
  incrementInstallCount(): Promise<IUnifiedWorkflow>;
}

// ============================================
// SCHEMAS
// ============================================

const WorkflowVariableSchema = new Schema<IWorkflowVariable>({
  key: { type: String, required: true },
  label: { type: String, required: true },
  type: {
    type: String,
    required: true,
    enum: Object.values(VariableType)
  },
  scope: {
    type: String,
    required: true,
    enum: Object.values(VariableScope)
  },
  value: { type: Schema.Types.Mixed },
  description: { type: String }
}, { _id: false });

const WorkflowNodeSchema = new Schema<IWorkflowNode>({
  id: { type: String, required: true },
  type: { type: String, required: true },
  subType: { type: String, required: true },
  position: {
    x: { type: Number, required: true },
    y: { type: Number, required: true }
  },
  data: { type: Schema.Types.Mixed, required: true }
}, { _id: false });

const WorkflowEdgeSchema = new Schema<IWorkflowEdge>({
  id: { type: String, required: true },
  source: { type: String, required: true },
  target: { type: String, required: true },
  sourceHandle: { type: String },
  targetHandle: { type: String },
  label: { type: String },
  condition: { type: String }
}, { _id: false });

const TriggerConfigSchema = new Schema<ITriggerConfig>({
  keywords: [{ type: String }],
  matchType: { type: String, enum: ['exact', 'contains', 'regex'] },
  caseSensitive: { type: Boolean },
  entityType: { type: String, enum: ['contact', 'company', 'deal'] },
  field: { type: String },
  fromValue: { type: Schema.Types.Mixed },
  toValue: { type: Schema.Types.Mixed },
  stageId: { type: Schema.Types.ObjectId },
  tagId: { type: Schema.Types.ObjectId },
  cronExpression: { type: String },
  timezone: { type: String },
  isRecurring: { type: Boolean },
  webhookPath: { type: String },
  webhookSecret: { type: String },
  webhookRequireTimestamp: { type: Boolean },
  contactFilter: { type: Schema.Types.Mixed },
  accountId: { type: Schema.Types.ObjectId },
  // Polling triggers (H5)
  pollSource: { type: String, enum: ['gmail_new_email', 'sheets_new_row', 'rss_new_item'] },
  intervalMinutes: { type: Number },
  connectionId: { type: String },
  spreadsheetId: { type: String },
  sheetName: { type: String },
  feedUrl: { type: String },
  gmailQuery: { type: String },
  gmailLabelId: { type: String }
}, { _id: false });

const WorkflowTriggerSchema = new Schema<IWorkflowTrigger>({
  type: { type: String, required: true },
  config: { type: TriggerConfigSchema, required: true }
}, { _id: false });

const EncryptedCredentialSchema = new Schema<IEncryptedCredential>({
  name: { type: String, required: true },
  type: {
    type: String,
    required: true,
    enum: ['api_key', 'oauth', 'basic_auth', 'custom']
  },
  encryptedValue: { type: String, required: true },
  iv: { type: String, required: true },
  authTag: { type: String, required: true },
  salt: { type: String, required: true },
  metadata: { type: Schema.Types.Mixed }
}, { _id: false });

const ErrorHandlingSchema = new Schema<IErrorHandling>({
  retryEnabled: { type: Boolean, default: false },
  maxRetries: { type: Number, default: 3 },
  retryDelay: { type: Number, default: 1000 },
  retryBackoff: {
    type: String,
    enum: ['linear', 'exponential'],
    default: 'exponential'
  },
  onErrorAction: {
    type: String,
    enum: ['continue', 'stop', 'retry', 'fallback'],
    default: 'stop'
  },
  fallbackNodeId: { type: String }
}, { _id: false });

const UnifiedWorkflowSchema = new Schema<IUnifiedWorkflow>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    type: {
      type: String,
      required: true,
      enum: Object.values(WorkflowType)
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(WorkflowStatus),
      default: WorkflowStatus.DRAFT,
      index: true
    },

    // Ownership
    brandId: {
      type: Schema.Types.ObjectId,
      ref: 'Brand',
      index: true,
    },
    createdById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    canvasId: {
      type: Schema.Types.ObjectId,
      ref: 'Canvas',
      index: true
    },

    // Workflow Definition
    trigger: { type: WorkflowTriggerSchema, required: true },
    nodes: { type: [WorkflowNodeSchema], default: [] },
    edges: { type: [WorkflowEdgeSchema], default: [] },
    variables: { type: [WorkflowVariableSchema], default: [] },

    // Error Handling
    errorHandling: {
      type: ErrorHandlingSchema,
      default: () => ({
        retryEnabled: false,
        maxRetries: 3,
        retryDelay: 1000,
        retryBackoff: 'exponential',
        onErrorAction: 'stop'
      })
    },

    // Credentials
    credentials: { type: [EncryptedCredentialSchema], default: [] },

    // Execution Settings
    runOnce: { type: Boolean, default: false },
    maxExecutions: { type: Number },
    cooldownMinutes: { type: Number },
    lastTriggeredAt: { type: Date },
    timeout: { type: Number, default: 300 }, // 5 minutes default

    // Advanced Features — default on so router / loop nodes dragged from the
    // palette don't silently refuse to run. The engine still respects false
    // when it's explicitly set (e.g. tenant-locked plans), but new canvases
    // get a working setup out of the box.
    enableParallel: { type: Boolean, default: true },
    enableLoops: { type: Boolean, default: true },

    // Stats
    executionCount: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failureCount: { type: Number, default: 0 },
    lastExecutedAt: { type: Date },
    lastExecutionStatus: {
      type: String,
      enum: Object.values(ExecutionStatus)
    },
    avgExecutionTime: { type: Number },

    // Template
    isTemplate: { type: Boolean, default: false, index: true },
    templateCategory: { type: String, index: true },
    templateTags: [{ type: String }],
    templateAuthor: { type: String },
    templateVersion: { type: Number, default: 1 },
    installCount: { type: Number, default: 0 },
    rating: { type: Number, min: 0, max: 5 },

    // Version Control
    version: { type: Number, default: 1 },

    // Migration provenance
    migrationMetadata: {
      type: new Schema(
        {
          sourceSystem: {
            type: String,
            enum: ['crm_workflow', 'whatsapp_workflow'],
            required: true,
          },
          sourceId: { type: Schema.Types.ObjectId, required: true },
          migratedAt: { type: Date, required: true },
          migratorVersion: { type: Number, required: true },
        },
        { _id: false }
      ),
      required: false,
    }
  },
  {
    timestamps: true,
    collection: 'unified_workflows'
  }
);

// ============================================
// INDEXES
// ============================================

UnifiedWorkflowSchema.index({ status: 1 });
UnifiedWorkflowSchema.index({ brandId: 1, status: 1 });
UnifiedWorkflowSchema.index({ type: 1, status: 1 });
UnifiedWorkflowSchema.index({ 'trigger.type': 1, status: 1 });
UnifiedWorkflowSchema.index({ isTemplate: 1, templateCategory: 1 });
UnifiedWorkflowSchema.index({ isTemplate: 1, rating: -1, installCount: -1 });
UnifiedWorkflowSchema.index(
  { 'migrationMetadata.sourceSystem': 1, 'migrationMetadata.sourceId': 1 },
  { unique: true, sparse: true }
);

// ============================================
// METHODS
// ============================================

UnifiedWorkflowSchema.methods.activate = function () {
  this.status = WorkflowStatus.ACTIVE;
  return this.save();
};

UnifiedWorkflowSchema.methods.deactivate = function () {
  this.status = WorkflowStatus.PAUSED;
  return this.save();
};

UnifiedWorkflowSchema.methods.incrementExecutionCount = function (success: boolean, duration?: number) {
  this.executionCount += 1;
  if (success) {
    this.successCount += 1;
  } else {
    this.failureCount += 1;
  }
  this.lastExecutedAt = new Date();
  this.lastExecutionStatus = success ? ExecutionStatus.COMPLETED : ExecutionStatus.FAILED;

  // Update average execution time
  if (duration) {
    if (this.avgExecutionTime) {
      this.avgExecutionTime = (this.avgExecutionTime + duration) / 2;
    } else {
      this.avgExecutionTime = duration;
    }
  }

  return this.save();
};

UnifiedWorkflowSchema.methods.incrementInstallCount = function () {
  this.installCount = (this.installCount || 0) + 1;
  return this.save();
};

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.UnifiedWorkflow) {
    delete mongoose.models.UnifiedWorkflow;
  }
}

export const UnifiedWorkflow: Model<IUnifiedWorkflow> =
  mongoose.models.UnifiedWorkflow ||
  mongoose.model<IUnifiedWorkflow>('UnifiedWorkflow', UnifiedWorkflowSchema);

export default UnifiedWorkflow;
