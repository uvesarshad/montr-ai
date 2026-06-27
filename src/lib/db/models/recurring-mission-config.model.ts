/**
 * Recurring mission configuration (B1-6.1).
 *
 * Stores per-brand schedules that automatically spawn a new AgentMission
 * from a mission template on the configured cron cadence.
 */

import mongoose, { Document, Schema } from 'mongoose';

export interface IRecurringMissionConfig extends Document {
  brandId: string;
  userId: string;
  templateId: string;
  /** Human-readable name shown in settings UI. */
  name: string;
  cronExpression: string;
  timezone: string;
  /** USD cents cap per spawned mission; 0 = use plan default. */
  budgetCap: number;
  enabled: boolean;
  nextRunAt: Date;
  lastRunAt?: Date;
  runCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const RecurringMissionConfigSchema = new Schema<IRecurringMissionConfig>(
  {
    brandId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    templateId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    cronExpression: { type: String, required: true },
    timezone: { type: String, default: 'UTC' },
    budgetCap: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true, index: true },
    nextRunAt: { type: Date, required: true, index: true },
    lastRunAt: { type: Date, default: null },
    runCount: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'agent_recurring_mission_configs' },
);

RecurringMissionConfigSchema.index({ brandId: 1 });

const RecurringMissionConfig =
  mongoose.models.RecurringMissionConfig ||
  mongoose.model<IRecurringMissionConfig>('RecurringMissionConfig', RecurringMissionConfigSchema);

export default RecurringMissionConfig;
