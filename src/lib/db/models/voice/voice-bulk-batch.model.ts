/**
 * Voice bulk call batch (V-8.5).
 *
 * One batch row per "dial these contacts now" job. Entries are embedded so
 * the per-call status is queryable in one read and visible in the UI without
 * a join.
 *
 * Dispatch model: a per-process dispatcher picks pending entries, places
 * calls at the configured rate (callsPerMinute), updates entries as the
 * Twilio webhook events flow in.
 */

import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type BulkCallEntryStatus =
  | 'pending'
  | 'placing'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'no_answer'
  | 'voicemail';

export interface IVoiceBulkCallEntry {
  contactId?: Types.ObjectId | null;
  phoneNumber: string;
  /** Personalization variables exposed to AI bot / TwiML at call time. */
  variables?: Record<string, unknown>;
  status: BulkCallEntryStatus;
  callSessionId?: Types.ObjectId | null;
  providerCallId?: string;
  startedAt?: Date;
  endedAt?: Date;
  durationSec?: number;
  errorMessage?: string;
}

export type BulkBatchStatus =
  | 'pending_approval'
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rejected';

export interface IVoiceBulkBatch extends Document {
  brandId?: Types.ObjectId | null;
  createdById: Types.ObjectId;

  name: string;
  description?: string;

  fromNumber: string;
  aiBotId?: string;
  aiCharacterId?: string;
  /** Optional script/prompt used by the AI bot on the call. */
  script?: string;
  recordCall: boolean;
  callsPerMinute: number;

  status: BulkBatchStatus;
  approvalId?: Types.ObjectId | null;
  startedAt?: Date;
  completedAt?: Date;

  entries: IVoiceBulkCallEntry[];

  /** Counters denormalized so the list view doesn't aggregate. */
  totals: {
    total: number;
    pending: number;
    placing: number;
    inProgress: number;
    completed: number;
    failed: number;
    noAnswer: number;
    voicemail: number;
  };

  createdAt: Date;
  updatedAt: Date;
}

const EntrySchema = new Schema<IVoiceBulkCallEntry>(
  {
    contactId: { type: Schema.Types.ObjectId, ref: 'CrmContact', default: null },
    phoneNumber: { type: String, required: true },
    variables: { type: Schema.Types.Mixed },
    status: {
      type: String,
      enum: ['pending', 'placing', 'in_progress', 'completed', 'failed', 'no_answer', 'voicemail'],
      default: 'pending',
    },
    callSessionId: { type: Schema.Types.ObjectId, ref: 'CallSession', default: null },
    providerCallId: { type: String },
    startedAt: { type: Date },
    endedAt: { type: Date },
    durationSec: { type: Number },
    errorMessage: { type: String },
  },
  { _id: true },
);

const TotalsSchema = new Schema(
  {
    total: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    placing: { type: Number, default: 0 },
    inProgress: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    noAnswer: { type: Number, default: 0 },
    voicemail: { type: Number, default: 0 },
  },
  { _id: false },
);

const VoiceBulkBatchSchema = new Schema<IVoiceBulkBatch>(
  {
    brandId: { type: Schema.Types.ObjectId, ref: 'Brand', default: null, index: true },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    fromNumber: { type: String, required: true },
    aiBotId: { type: String },
    aiCharacterId: { type: String },
    script: { type: String },
    recordCall: { type: Boolean, default: false },
    callsPerMinute: { type: Number, default: 10 },
    status: {
      type: String,
      enum: ['pending_approval', 'pending', 'running', 'paused', 'completed', 'failed', 'cancelled', 'rejected'],
      default: 'pending',
      index: true,
    },
    approvalId: { type: Schema.Types.ObjectId, ref: 'ApprovalRequest' },
    startedAt: { type: Date },
    completedAt: { type: Date },
    entries: { type: [EntrySchema], default: [] },
    totals: { type: TotalsSchema, default: () => ({}) },
  },
  { timestamps: true, collection: 'voice_bulk_batches' },
);

VoiceBulkBatchSchema.index({ createdAt: -1 });
VoiceBulkBatchSchema.index({ status: 1, createdAt: -1 });

if (process.env.NODE_ENV === 'development' && mongoose.models.VoiceBulkBatch) {
  delete mongoose.models.VoiceBulkBatch;
}

const VoiceBulkBatch: Model<IVoiceBulkBatch> =
  mongoose.models.VoiceBulkBatch
  || mongoose.model<IVoiceBulkBatch>('VoiceBulkBatch', VoiceBulkBatchSchema);

export default VoiceBulkBatch;
