import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type StrategyStatus = 'draft' | 'active' | 'archived';

export interface StrategyGoal {
  kpi: string;
  target: string;
  deadline: Date;
}

export interface StrategyContentMix {
  [format: string]: number; // e.g. { video: 40, image: 30, text: 30 } (percentages)
}

export interface StrategyCadence {
  postsPerWeek?: number;
  emailsPerWeek?: number;
  callsPerWeek?: number;
  whatsappPerWeek?: number;
}

export type StrategyValidationStatus = 'passed' | 'passed_with_warnings' | 'failed';

export interface StrategyValidationIssue {
  id: string;
  severity: 'error' | 'warn';
  message: string;
  field?: string;
}

export interface StrategyCriticDimension {
  name: string;       // specificity | actionability | feasibility | goalFit | grounding
  score: number;      // 1-5
  issues: string[];
  mustFix: string[];
}

export interface StrategyValidation {
  status: StrategyValidationStatus;
  deterministic: StrategyValidationIssue[];
  critic?: {
    dimensions: StrategyCriticDimension[];
    overall: number;   // 1-5
    summary: string;
  };
  qualityScore: number;   // 0-100 derived (display/sort only)
  checkedAt: Date;
  repairAttempts: number;
  reviseAttempts: number;
}

export interface IStrategy extends Document {
  orgId: Types.ObjectId | string;
  brandId: Types.ObjectId | string;
  name: string;
  description?: string;
  goals: StrategyGoal[];
  /** References to CRM persona contacts used as target audience archetypes. */
  personas: (Types.ObjectId | string)[];
  channels: string[];
  contentMix: StrategyContentMix;
  cadence: StrategyCadence;
  status: StrategyStatus;
  /** Monotonically increasing version number within a brand. */
  version: number;
  /** Points to the previous version for diff / comparison. */
  parentStrategyId?: Types.ObjectId | string | null;
  /** The mission that triggered auto-generation of this strategy. */
  generatedFromMissionId?: Types.ObjectId | string | null;
  /** Performance notes from the iteration cycle (B1-1.5). */
  iterationNotes?: string;
  /** Result of the strategy-validation layer; absent on legacy strategies. */
  validation?: StrategyValidation;
  createdAt: Date;
  updatedAt: Date;
}

const StrategyGoalSchema = new Schema<StrategyGoal>({
  kpi: { type: String, required: true },
  target: { type: String, required: true },
  deadline: { type: Date, required: true },
}, { _id: false });

const StrategyValidationIssueSchema = new Schema<StrategyValidationIssue>({
  id: { type: String, required: true },
  severity: { type: String, enum: ['error', 'warn'], required: true },
  message: { type: String, required: true },
  field: { type: String },
}, { _id: false });

const StrategyCriticDimensionSchema = new Schema<StrategyCriticDimension>({
  name: { type: String, required: true },
  score: { type: Number, required: true },
  issues: { type: [String], default: [] },
  mustFix: { type: [String], default: [] },
}, { _id: false });

const StrategySchema = new Schema<IStrategy>(
  {
    orgId: { type: Schema.Types.Mixed, required: true, index: true },
    brandId: { type: Schema.Types.Mixed, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    goals: { type: [StrategyGoalSchema], default: [] },
    personas: { type: [Schema.Types.Mixed], default: [] },
    channels: { type: [String], default: [] },
    contentMix: { type: Schema.Types.Mixed, default: () => ({}) },
    cadence: {
      postsPerWeek: { type: Number, default: 0 },
      emailsPerWeek: { type: Number, default: 0 },
      callsPerWeek: { type: Number, default: 0 },
      whatsappPerWeek: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'archived'],
      default: 'draft',
      index: true,
    },
    version: { type: Number, default: 1 },
    parentStrategyId: { type: Schema.Types.Mixed, default: null },
    generatedFromMissionId: { type: Schema.Types.Mixed, default: null },
    iterationNotes: { type: String, default: null },
    validation: {
      type: new Schema<StrategyValidation>(
        {
          status: {
            type: String,
            enum: ['passed', 'passed_with_warnings', 'failed'],
            required: true,
          },
          deterministic: { type: [StrategyValidationIssueSchema], default: [] },
          critic: {
            type: new Schema(
              {
                dimensions: { type: [StrategyCriticDimensionSchema], default: [] },
                overall: { type: Number, required: true },
                summary: { type: String, required: true },
              },
              { _id: false }
            ),
            default: undefined,
          },
          qualityScore: { type: Number, required: true },
          checkedAt: { type: Date, required: true },
          repairAttempts: { type: Number, default: 0 },
          reviseAttempts: { type: Number, default: 0 },
        },
        { _id: false }
      ),
      default: undefined,
    },
  },
  {
    timestamps: true,
    collection: 'agent_strategies',
  }
);

StrategySchema.index({ orgId: 1, brandId: 1, status: 1 });
StrategySchema.index({ orgId: 1, brandId: 1, createdAt: -1 });

const Strategy: Model<IStrategy> =
  mongoose.models.Strategy || mongoose.model<IStrategy>('Strategy', StrategySchema);

export default Strategy;
