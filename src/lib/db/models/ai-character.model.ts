/**
 * AiCharacter — reusable persona for cross-generation consistency.
 *
 * A character bundles the references a creator needs to keep an entity
 * recognizable across image / video / audio outputs:
 *
 *   - **Reference images** — for image / video generators that support
 *     identity preservation (Flux + char-LoRA, Runway image-to-video,
 *     Veo image conditioning).
 *   - **Voice samples + speaker id** — for TTS / voice-clone (ElevenLabs
 *     voice id, Sarvam speaker, OpenAI TTS voice name). The voice subsystem
 *     (Bundle 3) reads this when an AI voice bot needs a specific voice.
 *   - **Style descriptors** — natural-language attributes the orchestration
 *     layer prepends to user prompts.
 *
 * Agency mode: characters are org-scoped, optionally brand-scoped. A
 * character with `brandId: undefined` is shared across all brands in the
 * org (user choice on creation per the spec).
 */

import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IAiCharacterReferenceImage {
  /** Stored URL (media-asset preferred). */
  url: string;
  /** Optional MediaAsset id for traceability. */
  assetId?: Types.ObjectId;
  /** Caption / pose / mood hint — used at prompt time. */
  caption?: string;
}

export interface IAiCharacterVoice {
  /** Provider id (`openai`, `elevenlabs`, `sarvam`). */
  provider: string;
  /** Provider-side voice / speaker identifier. */
  voiceId: string;
  /** Optional reference audio sample URL (for clone-capable providers). */
  sampleUrl?: string;
  /** ISO language code (e.g. `en`, `hi-IN`). */
  language?: string;
}

/**
 * Talking-avatar binding (AI Studio revamp M2). How the character is rendered
 * as a presenter when a script → video is requested.
 *  - `image-driven` (default) — animate `sourceImageUrl` (D-ID / Hedra style),
 *    provider-agnostic. The source doubles as a referenceImage.
 *  - `preset` — use a provider catalog avatar (`providerAvatarId` + `provider`).
 */
export interface IAiCharacterAvatar {
  mode: 'image-driven' | 'preset';
  /** Photo-driven source portrait URL. */
  sourceImageUrl?: string;
  /** Optional MediaAsset id for the source portrait. */
  assetId?: Types.ObjectId;
  /** Preset-catalog avatar id (when mode = 'preset'). */
  providerAvatarId?: string;
  /** Provider id for preset avatars / render routing. */
  provider?: string;
}

export interface IAiCharacter extends Document {
  /** Undefined = shared across all brands in the org. */
  brandId?: Types.ObjectId;
  createdById: Types.ObjectId;

  name: string;
  description?: string;
  /** Natural-language style descriptors. */
  styleDescriptors?: string[];
  /** Tone / personality (used by text + audio generators). */
  personality?: string;

  referenceImages: IAiCharacterReferenceImage[];
  voice?: IAiCharacterVoice;
  /** Talking-avatar binding (M2). */
  avatar?: IAiCharacterAvatar;

  /** Optional LoRA / fine-tune model id for diffusion models. */
  loraModelId?: string;
  /** Optional negative prompt always appended for image gen. */
  negativePrompt?: string;

  status: 'active' | 'archived';
  usageCount: number;

  createdAt: Date;
  updatedAt: Date;
}

const ReferenceImageSchema = new Schema<IAiCharacterReferenceImage>({
  url: { type: String, required: true },
  assetId: { type: Schema.Types.ObjectId, ref: 'MediaAsset' },
  caption: String,
}, { _id: false });

const VoiceSchema = new Schema<IAiCharacterVoice>({
  provider: { type: String, required: true },
  voiceId: { type: String, required: true },
  sampleUrl: String,
  language: String,
}, { _id: false });

const AvatarSchema = new Schema<IAiCharacterAvatar>({
  mode: { type: String, enum: ['image-driven', 'preset'], required: true },
  sourceImageUrl: String,
  assetId: { type: Schema.Types.ObjectId, ref: 'MediaAsset' },
  providerAvatarId: String,
  provider: String,
}, { _id: false });

const AiCharacterSchema = new Schema<IAiCharacter>({
  brandId: { type: Schema.Types.ObjectId, ref: 'Brand', index: true },
  createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },

  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  styleDescriptors: [String],
  personality: String,

  referenceImages: { type: [ReferenceImageSchema], default: [] },
  voice: { type: VoiceSchema, required: false },
  avatar: { type: AvatarSchema, required: false },

  loraModelId: String,
  negativePrompt: String,

  status: {
    type: String,
    enum: ['active', 'archived'],
    default: 'active',
    index: true,
  },
  usageCount: { type: Number, default: 0 },
}, {
  timestamps: true,
  collection: 'ai_characters',
});

AiCharacterSchema.index({ brandId: 1, status: 1 });
AiCharacterSchema.index({ updatedAt: -1 });

if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.AiCharacter) {
    delete mongoose.models.AiCharacter;
  }
}

export const AiCharacter: Model<IAiCharacter> =
  mongoose.models.AiCharacter ||
  mongoose.model<IAiCharacter>('AiCharacter', AiCharacterSchema);

export default AiCharacter;
