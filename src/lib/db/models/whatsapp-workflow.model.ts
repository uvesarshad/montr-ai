import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWorkflowNode {
    id: string;
    type: 'trigger' | 'message' | 'logic' | 'ai' | 'data' | 'api';
    subType: string; // Specific node type (e.g., 'send-text', 'branch', etc.)
    position: {
        x: number;
        y: number;
    };
    data: {
        label?: string;
        config?: Record<string, unknown>; // Node-specific configuration
        [key: string]: unknown;
    };
}

export interface IWorkflowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    label?: string;
}

export interface IWorkflowVariable {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    defaultValue?: unknown;
    description?: string;
}

export interface IWorkflowTrigger {
    type: 'message' | 'keywords' | 'time' | 'email' | 'social_event' | 'keyword' | 'webhook' | 'telegram';
    config: {
        // For 'keywords' trigger
        keywords?: string[];
        matchType?: 'exact' | 'contains' | 'regex';
        caseSensitive?: boolean;

        // For 'time' trigger
        cronExpression?: string;
        timezone?: string;
        isRecurring?: boolean;

        // Common filters
        accountId?: string;
        accountFilter?: string;
        contactFilter?: Record<string, unknown>;

        // For 'email' trigger
        provider?: 'gmail' | 'outlook';
        filterType?: 'any' | 'subject' | 'sender' | 'label';
        filterValue?: string;

        // For 'social_event' trigger
        platforms?: ('instagram' | 'linkedin' | 'x' | 'facebook')[];
        eventType?: 'mention' | 'comment' | 'dm' | 'follower' | 'like';

        // For 'keyword' trigger monitoring
        sources?: ('web' | 'social' | 'news')[];
        checkFrequency?: string;

        // For 'webhook' trigger
        method?: string;

        // Generic
        [key: string]: unknown;
    };
}

export interface IWhatsAppWorkflow extends Document {
    userId: mongoose.Types.ObjectId;
    name: string;
    description?: string;
    status: 'draft' | 'active' | 'paused' | 'archived';
    trigger: IWorkflowTrigger;
    nodes: IWorkflowNode[];
    edges: IWorkflowEdge[];
    variables: IWorkflowVariable[];
    accountId?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
    lastExecutedAt?: Date;
    executionCount: number;
    version: number; // For future versioning support
}

const WorkflowNodeSchema = new Schema({
    id: { type: String, required: true },
    type: { type: String, required: true, enum: ['trigger', 'message', 'logic', 'ai', 'data', 'api'] },
    subType: { type: String, required: true },
    position: {
        x: { type: Number, required: true },
        y: { type: Number, required: true }
    },
    data: { type: Schema.Types.Mixed, default: {} }
}, { _id: false });

const WorkflowEdgeSchema = new Schema({
    id: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    sourceHandle: { type: String },
    targetHandle: { type: String },
    label: { type: String }
}, { _id: false });

const WorkflowVariableSchema = new Schema({
    name: { type: String, required: true },
    type: { type: String, required: true, enum: ['string', 'number', 'boolean', 'object', 'array'] },
    defaultValue: { type: Schema.Types.Mixed },
    description: { type: String }
}, { _id: false });

const WorkflowTriggerSchema = new Schema({
    type: { type: String, required: true, enum: ['message', 'keywords', 'time', 'email', 'social_event', 'keyword', 'webhook', 'telegram'] },
    config: { type: Schema.Types.Mixed, default: {} }
}, { _id: false });

const WhatsAppWorkflowSchema = new Schema<IWhatsAppWorkflow>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true },
        description: { type: String },
        status: {
            type: String,
            required: true,
            enum: ['draft', 'active', 'paused', 'archived'],
            default: 'draft',
            index: true
        },
        trigger: { type: WorkflowTriggerSchema, required: true },
        nodes: { type: [WorkflowNodeSchema], default: [] },
        edges: { type: [WorkflowEdgeSchema], default: [] },
        variables: { type: [WorkflowVariableSchema], default: [] },
        accountId: { type: Schema.Types.ObjectId, ref: 'WhatsAppAccount', index: true },
        lastExecutedAt: { type: Date },
        executionCount: { type: Number, default: 0 },
        version: { type: Number, default: 1 }
    },
    {
        timestamps: true,
        collection: 'whatsapp_workflows'
    }
);

// Indexes
WhatsAppWorkflowSchema.index({ userId: 1, status: 1 });
WhatsAppWorkflowSchema.index({ status: 1 });
WhatsAppWorkflowSchema.index({ accountId: 1, status: 1 });
WhatsAppWorkflowSchema.index({ 'trigger.type': 1, status: 1 });

// Methods
WhatsAppWorkflowSchema.methods.activate = function () {
    this.status = 'active';
    return this.save();
};

WhatsAppWorkflowSchema.methods.deactivate = function () {
    this.status = 'paused';
    return this.save();
};

WhatsAppWorkflowSchema.methods.incrementExecutionCount = function () {
    this.executionCount += 1;
    this.lastExecutedAt = new Date();
    return this.save();
};

export const WhatsAppWorkflow: Model<IWhatsAppWorkflow> =
    mongoose.models.WhatsAppWorkflow || mongoose.model<IWhatsAppWorkflow>('WhatsAppWorkflow', WhatsAppWorkflowSchema);
