import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type RoadmapEntryStatus = 'pending' | 'in_progress' | 'completed' | 'skipped';

export interface RoadmapEntry {
  id: string;
  missionTemplateId: string;
  title: string;
  description?: string;
  /** IDs of entries that must complete before this one starts. */
  dependsOn: string[];
  channel?: string;
  /** ISO 8601 offset from strategy start, e.g. 'P7D' = day 7. */
  suggestedStartOffset?: string;
  estimatedDurationDays?: number;
  status: RoadmapEntryStatus;
  /** Linked agent-mission ID once instantiated (B1-1.4). */
  missionId?: string | null;
}

export interface IStrategyRoadmap extends Document {
  strategyId: Types.ObjectId | string;
  orgId: Types.ObjectId | string;
  brandId: Types.ObjectId | string;
  entries: RoadmapEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const RoadmapEntrySchema = new Schema<RoadmapEntry>({
  id: { type: String, required: true },
  missionTemplateId: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: null },
  dependsOn: { type: [String], default: [] },
  channel: { type: String, default: null },
  suggestedStartOffset: { type: String, default: null },
  estimatedDurationDays: { type: Number, default: null },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'skipped'],
    default: 'pending',
  },
  missionId: { type: String, default: null },
}, { _id: false });

const StrategyRoadmapSchema = new Schema<IStrategyRoadmap>(
  {
    strategyId: { type: Schema.Types.Mixed, required: true, index: true },
    orgId: { type: Schema.Types.Mixed, required: true, index: true },
    brandId: { type: Schema.Types.Mixed, required: true },
    entries: { type: [RoadmapEntrySchema], default: [] },
  },
  {
    timestamps: true,
    collection: 'agent_strategy_roadmaps',
  }
);

StrategyRoadmapSchema.index({ orgId: 1, brandId: 1 });

const StrategyRoadmap: Model<IStrategyRoadmap> =
  mongoose.models.StrategyRoadmap ||
  mongoose.model<IStrategyRoadmap>('StrategyRoadmap', StrategyRoadmapSchema);

export default StrategyRoadmap;
