import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IAgentMissionLink extends Document {
  missionId: string;
  brandId: string;
  userId: string;
  targetType: string;
  targetId: string;
  targetLabel?: string;
  targetRoute?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const AgentMissionLinkSchema = new Schema<IAgentMissionLink>(
  {
    missionId: { type: String, required: true, index: true },
    brandId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    targetType: { type: String, required: true, trim: true },
    targetId: { type: String, required: true, trim: true },
    targetLabel: { type: String, default: null, trim: true },
    targetRoute: { type: String, default: null, trim: true },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
    collection: 'agent_mission_links',
  }
);

AgentMissionLinkSchema.index({ missionId: 1, targetType: 1, targetId: 1 }, { unique: true });
AgentMissionLinkSchema.index({ userId: 1, createdAt: -1 });

const AgentMissionLink: Model<IAgentMissionLink> =
  mongoose.models.AgentMissionLink ||
  mongoose.model<IAgentMissionLink>('AgentMissionLink', AgentMissionLinkSchema);

export default AgentMissionLink;
