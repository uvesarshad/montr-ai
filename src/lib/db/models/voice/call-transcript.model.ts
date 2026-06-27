/**
 * Call transcript — sentence-level structured transcript with speaker labels.
 *
 * One transcript per call session; populated by Phase 5's STT pipeline. The
 * `summary` field is an optional LLM-generated summary populated post-call.
 */

import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type CallTranscriptSpeaker = 'caller' | 'callee' | 'agent' | 'ai_bot' | 'unknown';

export interface ICallTranscriptSegment {
  speaker: CallTranscriptSpeaker;
  text: string;
  /** Offset from call answer (seconds). */
  startSec: number;
  endSec: number;
  confidence?: number;
  /** Detected sentiment for this segment. */
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface ICallTranscript extends Document {
  callSessionId: Types.ObjectId;
  brandId?: Types.ObjectId | null;

  language?: string;
  /** STT provider used (whisper, sarvam-stt, twilio-transcribe, etc.). */
  sttProvider?: string;

  segments: ICallTranscriptSegment[];

  /** Concatenated text for search and quick display. */
  plainText: string;

  /** Optional LLM-generated summary. */
  summary?: {
    text: string;
    model?: string;
    generatedAt?: Date;
    /** Key points and action items extracted by the LLM. */
    keyPoints?: string[];
    actionItems?: string[];
  };

  /** Status of the transcription job. */
  status: 'processing' | 'ready' | 'failed';
  errorMessage?: string;
  completedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const CallTranscriptSegmentSchema = new Schema<ICallTranscriptSegment>(
  {
    speaker: {
      type: String,
      enum: ['caller', 'callee', 'agent', 'ai_bot', 'unknown'],
      required: true,
    },
    text: { type: String, required: true },
    startSec: { type: Number, required: true },
    endSec: { type: Number, required: true },
    confidence: { type: Number },
    sentiment: { type: String, enum: ['positive', 'neutral', 'negative'] },
  },
  { _id: false },
);

const CallTranscriptSummarySchema = new Schema(
  {
    text: { type: String, required: true },
    model: { type: String },
    generatedAt: { type: Date },
    keyPoints: { type: [String], default: [] },
    actionItems: { type: [String], default: [] },
  },
  { _id: false },
);

const CallTranscriptSchema = new Schema<ICallTranscript>(
  {
    callSessionId: {
      type: Schema.Types.ObjectId,
      ref: 'CallSession',
      required: true,
      index: true,
    },
    brandId: {
      type: Schema.Types.ObjectId,
      ref: 'Brand',
      default: null,
      index: true,
    },
    language: { type: String },
    sttProvider: { type: String },
    segments: { type: [CallTranscriptSegmentSchema], default: [] },
    plainText: { type: String, default: '' },
    summary: { type: CallTranscriptSummarySchema },
    status: {
      type: String,
      enum: ['processing', 'ready', 'failed'],
      default: 'processing',
      index: true,
    },
    errorMessage: { type: String },
    completedAt: { type: Date },
  },
  { timestamps: true, collection: 'voice_call_transcripts' },
);

// One transcript per call session.
CallTranscriptSchema.index({ callSessionId: 1 }, { unique: true });

// Full-text search across transcripts within an org.
CallTranscriptSchema.index(
  { plainText: 'text', 'summary.text': 'text' },
  { name: 'call_transcript_text_search' },
);

if (process.env.NODE_ENV === 'development' && mongoose.models.CallTranscript) {
  delete mongoose.models.CallTranscript;
}

const CallTranscript: Model<ICallTranscript> =
  mongoose.models.CallTranscript
  || mongoose.model<ICallTranscript>('CallTranscript', CallTranscriptSchema);

export default CallTranscript;
