import mongoose, { Document, Model, Schema } from 'mongoose';

export type AgentMissionStatus =
  | 'draft'
  | 'active'
  | 'waiting'
  | 'scheduled'
  | 'blocked'
  | 'completed';

export type AgentMissionMode = 'mixed' | 'approval-first' | 'autonomous' | 'watch' | 'autopilot';

export type AgentMissionTerminatedReason =
  | 'budget_exceeded'
  | 'tool_calls_exceeded'
  | 'tokens_exceeded'
  | 'wallclock_exceeded'
  | 'retry_exhausted'
  | 'no_progress'
  | 'manual_kill';

export interface AgentMissionLimits {
  maxToolCalls: number;
  maxTokens: number;
  maxWallClockMs: number;
  maxCredits: number;
  maxRetriesPerTool: number;
}

export interface AgentMissionUsage {
  toolCalls: number;
  tokens: number;
  credits: number;
  retriesByTool: Record<string, number>;
  idleTurns: number;
}

export const DEFAULT_MISSION_LIMITS: AgentMissionLimits = {
  maxToolCalls: 100,
  maxTokens: 500_000,
  maxWallClockMs: 30 * 60 * 1000,
  maxCredits: 1000,
  maxRetriesPerTool: 3,
};

export const DEFAULT_MISSION_USAGE: AgentMissionUsage = {
  toolCalls: 0,
  tokens: 0,
  credits: 0,
  retriesByTool: {},
  idleTurns: 0,
};

export const MAX_IDLE_TURNS = 3;

export type AgentMissionPlanStepStatus = 'pending' | 'in_progress' | 'done' | 'skipped' | 'blocked';

export interface AgentMissionPlanStep {
  id: string;
  title: string;
  description?: string;
  status: AgentMissionPlanStepStatus;
  startedAt?: Date;
  completedAt?: Date;
  evidence?: string;
}

export interface AgentMissionPlan {
  goal?: string;
  steps: AgentMissionPlanStep[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IAgentMission extends Document {
  brandId: string;
  userId: string;
  /** Set when this mission was spawned via delegate_to_agent from a parent mission. */
  parentMissionId?: string;
  /** Source mission template id, if mission was created from a template. */
  templateId?: string;
  /** Strategy this mission belongs to, for self-correcting plans (B1-1.5). */
  strategyId?: string;
  /** Mission whose completion triggered this one via onComplete chaining. */
  chainedFromMissionId?: string;
  title: string;
  summary: string;
  status: AgentMissionStatus;
  mode: AgentMissionMode;
  activeAgentId: string;
  currentSessionId: string;
  latestUserMessage?: string;
  latestAssistantMessage?: string;
  messageCount: number;
  eventCount: number;
  lastActivityAt: Date;
  limits: AgentMissionLimits;
  usage: AgentMissionUsage;
  terminatedReason?: AgentMissionTerminatedReason;
  plan?: AgentMissionPlan;
  /**
   * Long-horizon hibernation (Phase 1 2026-06-05). When status is 'scheduled'
   * and wakeAt is set, the scheduled-task cron wakes the mission at wakeAt:
   * status → 'active', sessionStartedAt → now, idleTurns reset, continuation
   * dispatched. maxWallClockMs is enforced per wake-session (sessionStartedAt
   * base), not per mission lifetime.
   */
  wakeAt?: Date | null;
  /** Why the mission is hibernating — shown in the mission timeline/UI. */
  wakeReason?: string | null;
  /** Start of the current wake session; base for the per-session wall-clock budget. */
  sessionStartedAt?: Date | null;
  /** Total number of times this mission has been woken from hibernation. */
  wakeCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

const AgentMissionSchema = new Schema<IAgentMission>(
  {
    brandId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    parentMissionId: { type: String, default: null, index: true },
    templateId: { type: String, default: null, index: true },
    strategyId: { type: String, default: null, index: true },
    chainedFromMissionId: { type: String, default: null },
    title: { type: String, required: true, default: 'New mission', trim: true },
    summary: { type: String, default: 'Mission ready to begin.', trim: true },
    status: {
      type: String,
      enum: ['draft', 'active', 'waiting', 'scheduled', 'blocked', 'completed'],
      default: 'draft',
      index: true,
    },
    mode: {
      type: String,
      enum: ['mixed', 'approval-first', 'autonomous', 'watch', 'autopilot'],
      default: 'mixed',
    },
    activeAgentId: { type: String, default: 'general-agent' },
    currentSessionId: { type: String, default: '' },
    latestUserMessage: { type: String, default: null },
    latestAssistantMessage: { type: String, default: null },
    messageCount: { type: Number, default: 0 },
    eventCount: { type: Number, default: 0 },
    lastActivityAt: { type: Date, default: Date.now, index: true },
    limits: {
      maxToolCalls: { type: Number, default: DEFAULT_MISSION_LIMITS.maxToolCalls },
      maxTokens: { type: Number, default: DEFAULT_MISSION_LIMITS.maxTokens },
      maxWallClockMs: { type: Number, default: DEFAULT_MISSION_LIMITS.maxWallClockMs },
      maxCredits: { type: Number, default: DEFAULT_MISSION_LIMITS.maxCredits },
      maxRetriesPerTool: { type: Number, default: DEFAULT_MISSION_LIMITS.maxRetriesPerTool },
    },
    usage: {
      toolCalls: { type: Number, default: 0 },
      tokens: { type: Number, default: 0 },
      credits: { type: Number, default: 0 },
      retriesByTool: { type: Schema.Types.Mixed, default: () => ({}) },
      idleTurns: { type: Number, default: 0 },
    },
    terminatedReason: {
      type: String,
      enum: ['budget_exceeded', 'tool_calls_exceeded', 'tokens_exceeded', 'wallclock_exceeded', 'retry_exhausted', 'no_progress', 'manual_kill'],
      default: null,
    },
    wakeAt: { type: Date, default: null, index: true },
    wakeReason: { type: String, default: null },
    sessionStartedAt: { type: Date, default: null },
    wakeCount: { type: Number, default: 0 },
    plan: {
      goal: { type: String, default: null },
      steps: {
        type: [
          {
            id: { type: String, required: true },
            title: { type: String, required: true },
            description: { type: String, default: null },
            status: {
              type: String,
              enum: ['pending', 'in_progress', 'done', 'skipped', 'blocked'],
              default: 'pending',
            },
            startedAt: { type: Date, default: null },
            completedAt: { type: Date, default: null },
            evidence: { type: String, default: null },
          },
        ],
        default: [],
      },
      createdAt: { type: Date, default: null },
      updatedAt: { type: Date, default: null },
    },
  },
  {
    timestamps: true,
    collection: 'agent_missions',
  }
);

AgentMissionSchema.index({ userId: 1, lastActivityAt: -1 });
AgentMissionSchema.index({ brandId: 1, status: 1, lastActivityAt: -1 });

const AgentMission: Model<IAgentMission> =
  mongoose.models.AgentMission ||
  mongoose.model<IAgentMission>('AgentMission', AgentMissionSchema);

export default AgentMission;
