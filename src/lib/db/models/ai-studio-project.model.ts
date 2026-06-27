/**
 * AiStudioProject — canonical container for AI Studio work.
 *
 * Replaces the ad-hoc per-tool persistence with a single project model that
 * spans text, image, video, audio, and character work. A project holds many
 * sessions; each session is one user prompt + the resulting outputs.
 *
 * Agency mode: every project carries `organizationId` AND `brandId`, so brand
 * picker scoping works out of the box. `brandId` is optional only because
 * legacy projects predate the picker — new projects must set it.
 */

import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type AiStudioProjectKind = 'text' | 'image' | 'video' | 'audio' | 'character' | 'mixed';

export type AiStudioSessionStatus =
  | 'pending'        // queued but not started
  | 'running'        // in flight (long-running providers — video)
  | 'completed'      // outputs available
  | 'failed'
  | 'cancelled';

/**
 * One generation attempt within a project. A text-conversation project is
 * an ordered list of sessions; an image project is usually a single session
 * per prompt; a batch project (B2-3.14) is many sessions sharing a parent.
 */
export interface IAiStudioSession {
  id: string;
  kind: AiStudioProjectKind; // can override project's kind for mixed projects
  status: AiStudioSessionStatus;
  model: string;             // model id passed to the router
  prompt: string;            // user prompt
  systemPrompt?: string;     // optional system prompt for text/agentic
  settings?: Record<string, unknown>; // temperature, aspectRatio, voice, etc.
  /** Cross-reference to a media-asset doc (B2-3.12 bridge). */
  assetIds?: Types.ObjectId[];
  /** Direct URLs (for outputs not yet persisted to media-asset). */
  outputUrls?: string[];
  /** Inline text outputs (for text-mode sessions). */
  outputText?: string;
  /** Anthropic-style cache + usage info. */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  };
  costCents?: number;
  /** When the session entered `running`. */
  startedAt?: Date;
  /** When the session entered a terminal state. */
  endedAt?: Date;
  errorMessage?: string;
  /** Optional CharacterId — when set, the session was bound to a specific character. */
  characterId?: Types.ObjectId;
  /** Optional batch parent — when set, the session belongs to a batch run (B2-3.14). */
  batchId?: string;
}

export interface IAiStudioProject extends Document {
  brandId?: Types.ObjectId;
  createdById: Types.ObjectId;

  name: string;
  description?: string;
  kind: AiStudioProjectKind;
  status: 'active' | 'archived';

  /** Free-form settings shared across all sessions (default model, default voice, default character). */
  defaultSettings?: Record<string, unknown>;

  sessions: IAiStudioSession[];

  /** Stats — denormalized for cheap listing. */
  sessionCount: number;
  lastSessionAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema = new Schema<IAiStudioSession>({
  id: { type: String, required: true },
  kind: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'character', 'mixed'],
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    required: true,
    default: 'pending',
  },
  model: { type: String, required: true },
  prompt: { type: String, required: true },
  systemPrompt: String,
  settings: { type: Schema.Types.Mixed },
  assetIds: [{ type: Schema.Types.ObjectId, ref: 'MediaAsset' }],
  outputUrls: [String],
  outputText: String,
  usage: {
    promptTokens: Number,
    completionTokens: Number,
    totalTokens: Number,
    cacheReadInputTokens: Number,
    cacheCreationInputTokens: Number,
  },
  costCents: Number,
  startedAt: Date,
  endedAt: Date,
  errorMessage: String,
  characterId: { type: Schema.Types.ObjectId, ref: 'AiCharacter' },
  batchId: String,
}, { _id: false });

const AiStudioProjectSchema = new Schema<IAiStudioProject>({
  brandId: { type: Schema.Types.ObjectId, ref: 'Brand', index: true },
  createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  kind: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'character', 'mixed'],
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['active', 'archived'],
    default: 'active',
    index: true,
  },

  defaultSettings: { type: Schema.Types.Mixed },
  sessions: { type: [SessionSchema], default: [] },
  sessionCount: { type: Number, default: 0 },
  lastSessionAt: Date,
}, {
  timestamps: true,
  collection: 'ai_studio_projects',
});

AiStudioProjectSchema.index({ brandId: 1, kind: 1, status: 1 });
AiStudioProjectSchema.index({ updatedAt: -1 });
AiStudioProjectSchema.index({ 'sessions.batchId': 1 });

if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.AiStudioProject) {
    delete mongoose.models.AiStudioProject;
  }
}

export const AiStudioProject: Model<IAiStudioProject> =
  mongoose.models.AiStudioProject ||
  mongoose.model<IAiStudioProject>('AiStudioProject', AiStudioProjectSchema);

export default AiStudioProject;
