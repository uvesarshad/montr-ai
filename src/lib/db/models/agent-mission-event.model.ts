import mongoose, { Document, Model, Schema } from 'mongoose';

export type AgentMissionEventType =
  | 'message'
  | 'plan_step'
  | 'tool_call'
  | 'tool_result'
  | 'approval_request'
  | 'artifact_created'
  | 'scheduled_action'
  | 'status_change'
  | 'error';

export type AgentMissionEventRole = 'user' | 'assistant' | 'system';

export interface IAgentMissionEvent extends Document {
  missionId: string;
  brandId: string;
  userId: string;
  sessionId?: string;
  type: AgentMissionEventType;
  role?: AgentMissionEventRole;
  content?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const AgentMissionEventSchema = new Schema<IAgentMissionEvent>(
  {
    missionId: { type: String, required: true, index: true },
    brandId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    sessionId: { type: String, default: null },
    type: {
      type: String,
      enum: ['message', 'plan_step', 'tool_call', 'tool_result', 'approval_request', 'artifact_created', 'scheduled_action', 'status_change', 'error'],
      required: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      default: null,
    },
    content: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
    collection: 'agent_mission_events',
  }
);

AgentMissionEventSchema.index({ missionId: 1, createdAt: 1 });
AgentMissionEventSchema.index({ userId: 1, createdAt: -1 });

const AgentMissionEvent: Model<IAgentMissionEvent> =
  mongoose.models.AgentMissionEvent ||
  mongoose.model<IAgentMissionEvent>('AgentMissionEvent', AgentMissionEventSchema);

export default AgentMissionEvent;
