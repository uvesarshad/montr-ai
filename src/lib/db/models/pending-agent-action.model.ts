import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPendingAgentAction extends Document {
    brandId: string;
    userId: string;               // The user who started the session
    sessionId: string;            // Copilot session/conversation ID
    missionId?: string | null;

    // Tool call details
    toolName: string;             // e.g. "sendWhatsApp", "triggerWorkflow"
    toolArgs: Record<string, unknown>;// The arguments the AI wants to pass
    toolDescription: string;      // Human-readable description of what it will do

    // Status
    status: 'pending' | 'approved' | 'rejected' | 'expired';
    resolvedBy?: string;          // userId who approved/rejected
    resolvedAt?: Date;
    rejectionReason?: string;

    // Delegation (B1-7.2)
    delegatedTo?: string;         // userId this action was routed to
    delegatedBy?: string;         // userId who delegated it
    delegatedAt?: Date;

    // Expiry
    expiresAt: Date;

    createdAt: Date;
    updatedAt: Date;
}

const PendingAgentActionSchema = new Schema<IPendingAgentAction>(
    {
        brandId: { type: String, required: true },
        userId: { type: String, required: true, index: true },
        sessionId: { type: String, required: true },
        missionId: { type: String, default: null, index: true },

        toolName: { type: String, required: true },
        toolArgs: { type: Schema.Types.Mixed, required: true },
        toolDescription: { type: String, required: true },

        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'expired'],
            default: 'pending',
            index: true,
        },
        resolvedBy: { type: String, default: null },
        resolvedAt: { type: Date, default: null },
        rejectionReason: { type: String, default: null },

        delegatedTo: { type: String, default: null, index: true },
        delegatedBy: { type: String, default: null },
        delegatedAt: { type: Date, default: null },

        expiresAt: {
            type: Date,
            required: true,
            default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
    },
    {
        timestamps: true,
        collection: 'pending_agent_actions',
    }
);

PendingAgentActionSchema.index({ userId: 1, status: 1 });
PendingAgentActionSchema.index({ missionId: 1, status: 1, createdAt: -1 });
PendingAgentActionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

const PendingAgentAction: Model<IPendingAgentAction> =
    mongoose.models.PendingAgentAction ||
    mongoose.model<IPendingAgentAction>('PendingAgentAction', PendingAgentActionSchema);

export default PendingAgentAction;
