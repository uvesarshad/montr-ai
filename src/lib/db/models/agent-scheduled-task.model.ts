import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IAgentScheduledTask extends Document {
    brandId: string;
    userId: string;
    missionId?: string | null;

    // Task definition
    name: string;
    description: string;
    toolName: string;
    toolArgs: Record<string, unknown>;

    // Schedule
    cronExpression: string;     // e.g. "0 9 * * 1" (every Monday 9am)
    timezone: string;           // e.g. "Asia/Kolkata"
    nextRunAt: Date;
    lastRunAt?: Date;

    // Status
    status: 'active' | 'paused' | 'completed' | 'failed';
    lastResult?: {
        success: boolean;
        message: string;
        timestamp: Date;
    };
    runCount: number;
    maxRuns?: number;           // Optional: auto-complete after N runs

    createdAt: Date;
    updatedAt: Date;
}

const AgentScheduledTaskSchema = new Schema<IAgentScheduledTask>(
    {
        brandId: { type: String, required: true },
        userId: { type: String, required: true, index: true },
        missionId: { type: String, default: null, index: true },

        name: { type: String, required: true },
        description: { type: String, default: '' },
        toolName: { type: String, required: true },
        toolArgs: { type: Schema.Types.Mixed, required: true },

        cronExpression: { type: String, required: true },
        timezone: { type: String, default: 'UTC' },
        nextRunAt: { type: Date, required: true, index: true },
        lastRunAt: { type: Date, default: null },

        status: {
            type: String,
            enum: ['active', 'paused', 'completed', 'failed'],
            default: 'active',
            index: true,
        },
        lastResult: {
            success: { type: Boolean },
            message: { type: String },
            timestamp: { type: Date },
        },
        runCount: { type: Number, default: 0 },
        maxRuns: { type: Number, default: null },
    },
    {
        timestamps: true,
        collection: 'agent_scheduled_tasks',
    }
);

AgentScheduledTaskSchema.index({ status: 1, nextRunAt: 1 });
AgentScheduledTaskSchema.index({ status: 1 });
AgentScheduledTaskSchema.index({ missionId: 1, status: 1, nextRunAt: 1 });

const AgentScheduledTask: Model<IAgentScheduledTask> =
    mongoose.models.AgentScheduledTask ||
    mongoose.model<IAgentScheduledTask>('AgentScheduledTask', AgentScheduledTaskSchema);

export default AgentScheduledTask;
