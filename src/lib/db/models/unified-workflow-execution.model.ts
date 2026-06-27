import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { IExecutionStep, ExecutionStatus } from './unified-workflow.model';

/**
 * Unified Workflow Execution Model
 *
 * Tracks the execution of unified workflows with detailed per-node logging,
 * variable state tracking, and error information.
 */

export interface IUnifiedWorkflowExecution extends Document {
  // Workflow Reference
  workflowId: Types.ObjectId;
  workflowName: string;
  workflowType: 'whatsapp' | 'crm' | 'marketing_email' | 'unified';
  workflowVersion: number;

  // Context
  /** Agency mode (B2-5.4) — brand the execution is scoped to. Propagated from the workflow doc. */
  brandId?: Types.ObjectId;
  userId: Types.ObjectId;
  contactId?: Types.ObjectId;    // For WhatsApp/CRM workflows
  dealId?: Types.ObjectId;        // For CRM workflows
  campaignId?: Types.ObjectId;    // For Marketing Email workflows

  // Execution State
  status: ExecutionStatus;
  currentNodeId?: string;
  currentStep: number;

  // Runtime Data
  variables: Record<string, unknown>;    // Current variable state
  triggerData: unknown;                  // Data that triggered the workflow
  context: Record<string, unknown>;      // Additional context

  // Execution Path
  executionPath: IExecutionStep[];

  // Timing
  startedAt: Date;
  completedAt?: Date;
  duration?: number;  // milliseconds

  // Error Information
  error?: string;
  errorStack?: string;
  errorNodeId?: string;

  // Retry Information
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: Date;

  // Parallel Execution
  parallelBranches?: Array<{
    branchId: string;
    nodeIds: string[];
    status: ExecutionStatus;
    completedAt?: Date;
  }>;

  // Loop Execution
  loopState?: {
    nodeId: string;
    currentIteration: number;
    totalIterations: number;
    iterationData: unknown[];
  };

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Methods
  addStep(step: Omit<IExecutionStep, 'timestamp'>): Promise<IUnifiedWorkflowExecution>;
  updateStatus(status: ExecutionStatus, error?: string, errorStack?: string): Promise<IUnifiedWorkflowExecution>;
  updateVariable(name: string, value: unknown): Promise<IUnifiedWorkflowExecution>;
  updateVariables(variables: Record<string, unknown>): Promise<IUnifiedWorkflowExecution>;
  updateCurrentNode(nodeId: string): Promise<IUnifiedWorkflowExecution>;
  scheduleRetry(retryDelayMs: number): Promise<IUnifiedWorkflowExecution>;
  addParallelBranch(branch: { branchId: string; nodeIds: string[] }): Promise<IUnifiedWorkflowExecution>;
  updateParallelBranch(branchId: string, status: ExecutionStatus): Promise<IUnifiedWorkflowExecution>;
  initializeLoop(nodeId: string, iterationData: unknown[]): Promise<IUnifiedWorkflowExecution>;
  incrementLoopIteration(): Promise<IUnifiedWorkflowExecution>;
  clearLoopState(): Promise<IUnifiedWorkflowExecution>;
}

// ============================================
// SCHEMAS
// ============================================

const ExecutionStepSchema = new Schema<IExecutionStep>({
  nodeId: { type: String, required: true },
  nodeName: { type: String },
  timestamp: { type: Date, required: true, default: Date.now },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'running', 'success', 'failed', 'skipped', 'pinned']
  },
  input: { type: Schema.Types.Mixed },
  output: { type: Schema.Types.Mixed },
  error: { type: String },
  errorStack: { type: String },
  duration: { type: Number },
  retryCount: { type: Number, default: 0 },
  variables: { type: Schema.Types.Mixed }
}, { _id: false });

const ParallelBranchSchema = new Schema({
  branchId: { type: String, required: true },
  nodeIds: [{ type: String }],
  status: {
    type: String,
    required: true,
    enum: Object.values(ExecutionStatus)
  },
  completedAt: { type: Date }
}, { _id: false });

const LoopStateSchema = new Schema({
  nodeId: { type: String, required: true },
  currentIteration: { type: Number, required: true },
  totalIterations: { type: Number, required: true },
  iterationData: [{ type: Schema.Types.Mixed }]
}, { _id: false });

const UnifiedWorkflowExecutionSchema = new Schema<IUnifiedWorkflowExecution>(
  {
    // Workflow Reference
    workflowId: {
      type: Schema.Types.ObjectId,
      ref: 'UnifiedWorkflow',
      required: true,
      index: true
    },
    workflowName: { type: String, required: true },
    workflowType: {
      type: String,
      required: true,
      enum: ['whatsapp', 'crm', 'marketing_email', 'unified']
    },
    workflowVersion: { type: Number, required: true, default: 1 },

    // Context
    brandId: {
      type: Schema.Types.ObjectId,
      ref: 'Brand',
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    contactId: {
      type: Schema.Types.ObjectId,
      ref: 'Contact',
      index: true
    },
    dealId: {
      type: Schema.Types.ObjectId,
      ref: 'Deal',
      index: true
    },
    campaignId: {
      type: Schema.Types.ObjectId,
      index: true
    },

    // Execution State
    status: {
      type: String,
      required: true,
      enum: Object.values(ExecutionStatus),
      default: ExecutionStatus.PENDING,
      index: true
    },
    currentNodeId: { type: String },
    currentStep: { type: Number, default: 0 },

    // Runtime Data
    variables: { type: Schema.Types.Mixed, default: {} },
    triggerData: { type: Schema.Types.Mixed },
    context: { type: Schema.Types.Mixed, default: {} },

    // Execution Path
    executionPath: {
      type: [ExecutionStepSchema],
      default: []
    },

    // Timing
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    completedAt: { type: Date },
    duration: { type: Number },

    // Error Information
    error: { type: String },
    errorStack: { type: String },
    errorNodeId: { type: String },

    // Retry Information
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    nextRetryAt: { type: Date },

    // Parallel Execution
    parallelBranches: [ParallelBranchSchema],

    // Loop Execution
    loopState: LoopStateSchema
  },
  {
    timestamps: true,
    collection: 'unified_workflow_executions'
  }
);

// ============================================
// INDEXES
// ============================================

UnifiedWorkflowExecutionSchema.index({ workflowId: 1, startedAt: -1 });
UnifiedWorkflowExecutionSchema.index({ startedAt: -1 });
UnifiedWorkflowExecutionSchema.index({ status: 1, startedAt: -1 });
UnifiedWorkflowExecutionSchema.index({ contactId: 1, startedAt: -1 });
UnifiedWorkflowExecutionSchema.index({ status: 1, nextRetryAt: 1 }); // For retry processing

// ============================================
// METHODS
// ============================================

UnifiedWorkflowExecutionSchema.methods.addStep = function (step: Omit<IExecutionStep, 'timestamp'>) {
  this.executionPath.push({
    ...step,
    timestamp: new Date()
  });
  this.currentStep = this.executionPath.length;
  this.markModified('executionPath');
  return this.save();
};

UnifiedWorkflowExecutionSchema.methods.updateStatus = function (
  status: ExecutionStatus,
  error?: string,
  errorStack?: string
) {
  this.status = status;

  if (status === ExecutionStatus.COMPLETED || status === ExecutionStatus.FAILED || status === ExecutionStatus.CANCELLED) {
    this.completedAt = new Date();
    this.duration = this.completedAt.getTime() - this.startedAt.getTime();
  }

  if (error) {
    this.error = error;
    this.errorStack = errorStack;
  }

  return this.save();
};

UnifiedWorkflowExecutionSchema.methods.updateVariable = function (name: string, value: unknown) {
  this.variables[name] = value;
  this.markModified('variables');
  return this.save();
};

UnifiedWorkflowExecutionSchema.methods.updateVariables = function (variables: Record<string, unknown>) {
  this.variables = { ...this.variables, ...variables };
  this.markModified('variables');
  return this.save();
};

UnifiedWorkflowExecutionSchema.methods.updateCurrentNode = function (nodeId: string) {
  this.currentNodeId = nodeId;
  return this.save();
};

UnifiedWorkflowExecutionSchema.methods.scheduleRetry = function (retryDelayMs: number) {
  this.retryCount += 1;
  this.status = ExecutionStatus.PENDING;
  this.nextRetryAt = new Date(Date.now() + retryDelayMs);
  return this.save();
};

UnifiedWorkflowExecutionSchema.methods.addParallelBranch = function (branch: {
  branchId: string;
  nodeIds: string[];
}) {
  if (!this.parallelBranches) {
    this.parallelBranches = [];
  }
  this.parallelBranches.push({
    ...branch,
    status: ExecutionStatus.RUNNING,
    completedAt: undefined
  });
  this.markModified('parallelBranches');
  return this.save();
};

UnifiedWorkflowExecutionSchema.methods.updateParallelBranch = function (
  branchId: string,
  status: ExecutionStatus
) {
  if (!this.parallelBranches) return this.save();

  const branch = this.parallelBranches.find((b: { branchId: string; status: ExecutionStatus; completedAt?: Date }) => b.branchId === branchId);
  if (branch) {
    branch.status = status;
    if (status === ExecutionStatus.COMPLETED || status === ExecutionStatus.FAILED) {
      branch.completedAt = new Date();
    }
    this.markModified('parallelBranches');
  }
  return this.save();
};

UnifiedWorkflowExecutionSchema.methods.initializeLoop = function (
  nodeId: string,
  iterationData: unknown[]
) {
  this.loopState = {
    nodeId,
    currentIteration: 0,
    totalIterations: iterationData.length,
    iterationData
  };
  this.markModified('loopState');
  return this.save();
};

UnifiedWorkflowExecutionSchema.methods.incrementLoopIteration = function () {
  if (!this.loopState) return this.save();

  this.loopState.currentIteration += 1;
  this.markModified('loopState');
  return this.save();
};

UnifiedWorkflowExecutionSchema.methods.clearLoopState = function () {
  this.loopState = undefined;
  this.markModified('loopState');
  return this.save();
};

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.UnifiedWorkflowExecution) {
    delete mongoose.models.UnifiedWorkflowExecution;
  }
}

export const UnifiedWorkflowExecution: Model<IUnifiedWorkflowExecution> =
  mongoose.models.UnifiedWorkflowExecution ||
  mongoose.model<IUnifiedWorkflowExecution>('UnifiedWorkflowExecution', UnifiedWorkflowExecutionSchema);

export default UnifiedWorkflowExecution;
