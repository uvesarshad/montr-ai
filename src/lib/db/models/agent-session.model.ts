import mongoose, { Schema, Document, Model } from 'mongoose';
import { CoreMessage } from 'ai';

/**
 * Agent Session — persisted in MongoDB for durability across server restarts.
 * Key: userId + brandId (one active session per user per brand).
 */
export interface IAgentSession extends Document {
    userId: string;
    brandId: string;
    sessionId: string;
    activeAgentId: string;
    history: CoreMessage[];

    messageCount: number;
    agentSwitchCount: number;
    lastActivityAt: Date;

    createdAt: Date;
    updatedAt: Date;
}

const AgentSessionSchema = new Schema<IAgentSession>(
    {
        userId: { type: String, required: true },
        brandId: { type: String, required: true },
        sessionId: { type: String, required: true, unique: true },
        activeAgentId: { type: String, default: 'general-agent' },
        history: { type: Schema.Types.Mixed, default: [] },

        messageCount: { type: Number, default: 0 },
        agentSwitchCount: { type: Number, default: 0 },
        lastActivityAt: { type: Date, default: Date.now },
    },
    {
        timestamps: true,
        collection: 'agent_sessions',
    }
);

// Compound unique index for one session per user+brand
AgentSessionSchema.index({ userId: 1, brandId: 1 }, { unique: true });
// TTL: automatically delete sessions inactive for 2 hours
AgentSessionSchema.index({ lastActivityAt: 1 }, { expireAfterSeconds: 7200 });

const AgentSession: Model<IAgentSession> =
    mongoose.models.AgentSession ||
    mongoose.model<IAgentSession>('AgentSession', AgentSessionSchema);

export default AgentSession;
