/**
 * Client-side AI Studio types — plain serialized shapes mirroring the
 * `AiStudioProject` / `AiStudioSession` Mongoose models. Defined here (not
 * imported from the model) so client bundles never pull in mongoose.
 */

export type StudioKind = 'text' | 'image' | 'video' | 'audio' | 'character' | 'mixed';

export type StudioSessionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** The five user-facing modes in the type-first switcher (no 'mixed'). */
export const STUDIO_MODES: Exclude<StudioKind, 'mixed'>[] = [
  'image',
  'video',
  'audio',
  'text',
  'character',
];

export interface StudioSession {
  id: string;
  kind: StudioKind;
  status: StudioSessionStatus;
  model: string;
  prompt: string;
  systemPrompt?: string;
  settings?: Record<string, unknown>;
  outputUrls?: string[];
  outputText?: string;
  assetIds?: string[];
  characterId?: string;
  batchId?: string;
  costCents?: number;
  errorMessage?: string;
  startedAt?: string;
  endedAt?: string;
}

export interface StudioProject {
  _id: string;
  brandId?: string;
  createdById: string;
  name: string;
  description?: string;
  kind: StudioKind;
  status: 'active' | 'archived';
  defaultSettings?: Record<string, unknown>;
  sessions: StudioSession[];
  sessionCount: number;
  lastSessionAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudioCharacterRefImage {
  url: string;
  assetId?: string;
  caption?: string;
}

export interface StudioCharacterVoice {
  provider: string;
  voiceId: string;
  sampleUrl?: string;
  language?: string;
}

export interface StudioCharacterAvatar {
  mode: 'image-driven' | 'preset';
  sourceImageUrl?: string;
  assetId?: string;
  providerAvatarId?: string;
  provider?: string;
}

export interface StudioCharacter {
  _id: string;
  brandId?: string;
  name: string;
  description?: string;
  styleDescriptors?: string[];
  personality?: string;
  referenceImages: StudioCharacterRefImage[];
  voice?: StudioCharacterVoice;
  avatar?: StudioCharacterAvatar;
  negativePrompt?: string;
  loraModelId?: string;
  status: 'active' | 'archived';
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}
