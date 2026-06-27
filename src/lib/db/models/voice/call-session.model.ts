/**
 * Call session — one row per call, inbound or outbound.
 *
 * Contact resolution today (B3 not running):
 *   - Outbound: caller passes `fromContactId` (existing crm_contacts.findById).
 *     `toContactId` is best-effort: look up by phone number, or leave null.
 *   - Inbound: store raw `fromNumber`. `fromContactId` stays null until B3's
 *     identity resolver (X2) backfills it.
 *
 * A `// TODO B3: identity resolver backfill` marker lives on the inbound path
 * so the backfill task is discoverable.
 */

import mongoose, { Schema, Document, Model, Types } from 'mongoose';

import type {
  VoiceCallDirection,
  VoiceCallStatus,
  VoiceProviderId,
} from '@/lib/voice/types';

export type VoiceCallEndReason =
  | 'completed'
  | 'busy'
  | 'no-answer'
  | 'failed'
  | 'cancelled'
  | 'machine_detected'
  | 'voicemail'
  | 'hangup_by_caller'
  | 'hangup_by_callee'
  | 'hangup_by_ai'
  | 'timeout'
  | 'error';

export interface ICallDisposition {
  outcome: 'connected' | 'voicemail' | 'no_answer' | 'busy' | 'failed' | 'declined';
  sentiment?: 'positive' | 'neutral' | 'negative';
  /** AI-classified intent or human-tagged outcome. */
  category?: string;
  notes?: string;
  taggedById?: Types.ObjectId;
}

/**
 * All-in per-call cost breakdown (LLM + STT + TTS + telephony).
 *
 * `source: 'estimated'` is written live at call end from per-minute / per-token
 * rate tables (see `src/lib/voice/cost-estimate.ts`) — it is NOT billing truth.
 * `source: 'reconciled'` is set once cost-reconciliation swaps `telephony` for
 * the provider's real billed figure and recomputes `total`.
 */
export interface ICallCostBreakdown {
  llm: number;
  stt: number;
  tts: number;
  telephony: number;
  total: number;
  currency: string;
  source: 'estimated' | 'reconciled';
}

export interface ICallSession extends Document {
  brandId?: Types.ObjectId | null;

  providerId: VoiceProviderId;
  /** Provider's call ID (Twilio CallSid, etc.). Unique per provider. */
  providerCallId: string;
  /** Reference to the provider config used (for audit + cost reconciliation). */
  providerConfigId?: Types.ObjectId;

  direction: VoiceCallDirection;
  fromNumber: string;
  toNumber: string;

  // Contact resolution — see file header for the "B3 not running" rules.
  fromContactId?: Types.ObjectId | null;
  toContactId?: Types.ObjectId | null;
  /** True if `fromContactId`/`toContactId` were set by the X2 identity resolver. */
  contactsResolvedByX2?: boolean;

  /** Who initiated an outbound call (user click, workflow, AI agent). */
  initiatorType?: 'user' | 'workflow' | 'ai_bot' | 'system';
  initiatorId?: string;

  status: VoiceCallStatus;
  endReason?: VoiceCallEndReason;
  errorCode?: string;
  errorMessage?: string;

  startedAt: Date;
  answeredAt?: Date;
  endedAt?: Date;
  durationSec?: number;

  recordingUrl?: string | null;
  recordingDurationSec?: number;
  /** Reference to call_transcript._id once transcription completes. */
  transcriptId?: Types.ObjectId | null;

  /** Live cost recorded from the provider; reconciled later from billing API. */
  costAmount?: number;
  costCurrency?: string;
  /** All-in cost breakdown (LLM + STT + TTS + telephony) — estimated, then reconciled. */
  costBreakdown?: ICallCostBreakdown;

  /**
   * If this call belongs to a workflow execution, the runId. The unified
   * workflow engine uses this to resume on `call.completed`.
   */
  workflowRunId?: string;

  /** Voice phone number doc if call routed via an owned number. */
  phoneNumberId?: Types.ObjectId;

  disposition?: ICallDisposition;
  customMetadata: Record<string, unknown>;

  createdAt: Date;
  updatedAt: Date;
}

const CallDispositionSchema = new Schema<ICallDisposition>(
  {
    outcome: {
      type: String,
      enum: ['connected', 'voicemail', 'no_answer', 'busy', 'failed', 'declined'],
      required: true,
    },
    sentiment: { type: String, enum: ['positive', 'neutral', 'negative'] },
    category: { type: String },
    notes: { type: String },
    taggedById: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false },
);

const CostBreakdownSchema = new Schema<ICallCostBreakdown>(
  {
    llm: { type: Number, required: true, default: 0 },
    stt: { type: Number, required: true, default: 0 },
    tts: { type: Number, required: true, default: 0 },
    telephony: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true, default: 0 },
    currency: { type: String, required: true, default: 'USD' },
    source: { type: String, enum: ['estimated', 'reconciled'], required: true, default: 'estimated' },
  },
  { _id: false },
);

const CallSessionSchema = new Schema<ICallSession>(
  {
    brandId: {
      type: Schema.Types.ObjectId,
      ref: 'Brand',
      default: null,
      index: true,
    },
    providerId: { type: String, required: true, index: true },
    providerCallId: { type: String, required: true },
    providerConfigId: { type: Schema.Types.ObjectId, ref: 'VoiceProviderConfig' },
    direction: { type: String, enum: ['inbound', 'outbound'], required: true, index: true },
    fromNumber: { type: String, required: true, index: true },
    toNumber: { type: String, required: true, index: true },
    fromContactId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmContact',
      default: null,
      index: true,
    },
    toContactId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmContact',
      default: null,
      index: true,
    },
    contactsResolvedByX2: { type: Boolean, default: false },
    initiatorType: { type: String, enum: ['user', 'workflow', 'ai_bot', 'system'] },
    initiatorId: { type: String },
    status: {
      type: String,
      required: true,
      default: 'queued',
      index: true,
    },
    endReason: { type: String },
    errorCode: { type: String },
    errorMessage: { type: String },
    startedAt: { type: Date, default: () => new Date(), index: true },
    answeredAt: { type: Date },
    endedAt: { type: Date },
    durationSec: { type: Number },
    recordingUrl: { type: String, default: null },
    recordingDurationSec: { type: Number },
    transcriptId: {
      type: Schema.Types.ObjectId,
      ref: 'CallTranscript',
      default: null,
    },
    costAmount: { type: Number },
    costCurrency: { type: String, default: 'USD' },
    costBreakdown: { type: CostBreakdownSchema },
    workflowRunId: { type: String, index: true },
    phoneNumberId: { type: Schema.Types.ObjectId, ref: 'VoicePhoneNumber' },
    disposition: { type: CallDispositionSchema },
    customMetadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'voice_call_sessions' },
);

// Indexes per V-3.3 in the task doc.
CallSessionSchema.index(
  { providerId: 1, providerCallId: 1 },
  { unique: true, name: 'voice_call_provider_unique' },
);
CallSessionSchema.index({ startedAt: -1 });
// Covering index for the plan-gate monthly-minutes sum (org + month + durationSec),
// so `sumMinutesThisMonth` is served from the index without fetching docs.
CallSessionSchema.index({ startedAt: -1, durationSec: 1 });
CallSessionSchema.index({ brandId: 1, startedAt: -1 });
CallSessionSchema.index({ fromContactId: 1, startedAt: -1 });
CallSessionSchema.index({ toContactId: 1, startedAt: -1 });
CallSessionSchema.index({ fromNumber: 1, startedAt: -1 });
CallSessionSchema.index({ toNumber: 1, startedAt: -1 });
CallSessionSchema.index({ direction: 1, status: 1 });
// Used by the X2 backfill job: find sessions still missing contact resolution.
CallSessionSchema.index({ contactsResolvedByX2: 1, startedAt: 1 });

if (process.env.NODE_ENV === 'development' && mongoose.models.CallSession) {
  delete mongoose.models.CallSession;
}

const CallSession: Model<ICallSession> =
  mongoose.models.CallSession
  || mongoose.model<ICallSession>('CallSession', CallSessionSchema);

export default CallSession;
