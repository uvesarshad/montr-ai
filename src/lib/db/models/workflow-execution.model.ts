import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IExecutionStep {
    nodeId: string;
    nodeName?: string;
    timestamp: Date;
    status: 'success' | 'failed' | 'skipped';
    output?: unknown;
    error?: string;
    duration?: number; // milliseconds
}

export interface IWorkflowExecution extends Document {
    workflowId: mongoose.Types.ObjectId;
    contactId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    status: 'running' | 'completed' | 'failed' | 'paused';
    currentNodeId?: string;
    variables: Record<string, unknown>; // Runtime variables
    executionPath: IExecutionStep[];
    startedAt: Date;
    completedAt?: Date;
    error?: string;
    triggerData?: unknown; // Data that triggered the workflow
}

const ExecutionStepSchema = new Schema({
    nodeId: { type: String, required: true },
    nodeName: { type: String },
    timestamp: { type: Date, required: true, default: Date.now },
    status: { type: String, required: true, enum: ['success', 'failed', 'skipped'] },
    output: { type: Schema.Types.Mixed },
    error: { type: String },
    duration: { type: Number }
}, { _id: false });

const WorkflowExecutionSchema = new Schema<IWorkflowExecution>(
    {
        workflowId: { type: Schema.Types.ObjectId, ref: 'WhatsAppWorkflow', required: true, index: true },
        contactId: { type: Schema.Types.ObjectId, ref: 'Contact', required: true, index: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        status: {
            type: String,
            required: true,
            enum: ['running', 'completed', 'failed', 'paused'],
            default: 'running',
            index: true
        },
        currentNodeId: { type: String },
        variables: { type: Schema.Types.Mixed, default: {} },
        executionPath: { type: [ExecutionStepSchema], default: [] },
        startedAt: { type: Date, required: true, default: Date.now, index: true },
        completedAt: { type: Date },
        error: { type: String },
        triggerData: { type: Schema.Types.Mixed }
    },
    {
        timestamps: true,
        collection: 'workflow_executions'
    }
);

// Indexes
WorkflowExecutionSchema.index({ workflowId: 1, startedAt: -1 });
WorkflowExecutionSchema.index({ contactId: 1, startedAt: -1 });
WorkflowExecutionSchema.index({ status: 1, startedAt: -1 });

// Methods
WorkflowExecutionSchema.methods.addStep = function (step: Omit<IExecutionStep, 'timestamp'>) {
    this.executionPath.push({
        ...step,
        timestamp: new Date()
    });
    return this.save();
};

WorkflowExecutionSchema.methods.complete = function (success: boolean = true, error?: string) {
    this.status = success ? 'completed' : 'failed';
    this.completedAt = new Date();
    if (error) {
        this.error = error;
    }
    return this.save();
};

WorkflowExecutionSchema.methods.updateVariable = function (name: string, value: unknown) {
    this.variables[name] = value;
    this.markModified('variables');
    return this.save();
};

export const WorkflowExecution: Model<IWorkflowExecution> =
    mongoose.models.WorkflowExecution || mongoose.model<IWorkflowExecution>('WorkflowExecution', WorkflowExecutionSchema);
