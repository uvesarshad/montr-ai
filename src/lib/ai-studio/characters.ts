/**
 * AI Studio characters — org/brand-scoped CRUD for reusable AiCharacter
 * identities (AI Studio revamp M2).
 *
 * Brand scoping mirrors the model rule: a character with `brandId` unset is
 * shared across all brands in the org. So listing for an active brand returns
 * that brand's characters PLUS the org-shared ones. All writes are org-scoped
 * so a mismatched tenant matches nothing (callers map null → 404).
 */

import { Types } from 'mongoose';
import { connectMongoose } from '@/lib/mongodb';
import {
  AiCharacter,
  type IAiCharacterAvatar,
  type IAiCharacterReferenceImage,
  type IAiCharacterVoice,
} from '@/lib/db/models/ai-character.model';

export interface ListCharactersInput {
  brandId?: Types.ObjectId | string;
  status?: 'active' | 'archived';
  limit?: number;
  skip?: number;
}

export async function listCharacters(input: ListCharactersInput) {
  await connectMongoose();
  const filter: Record<string, unknown> = {
    status: input.status ?? 'active',
  };
  if (input.brandId) {
    // brand's own + org-shared (brandId unset/null)
    filter.$or = [
      { brandId: new Types.ObjectId(String(input.brandId)) },
      { brandId: { $exists: false } },
      { brandId: null },
    ];
  }
  return AiCharacter.find(filter)
    .sort({ updatedAt: -1 })
    .limit(input.limit ?? 100)
    .skip(input.skip ?? 0)
    .exec();
}

export interface CreateCharacterInput {
  brandId?: Types.ObjectId | string;
  createdById: Types.ObjectId | string;
  name: string;
  description?: string;
  styleDescriptors?: string[];
  personality?: string;
  referenceImages?: IAiCharacterReferenceImage[];
  voice?: IAiCharacterVoice;
  avatar?: IAiCharacterAvatar;
  negativePrompt?: string;
  loraModelId?: string;
}

export async function createCharacter(input: CreateCharacterInput) {
  await connectMongoose();
  return AiCharacter.create({
    brandId: input.brandId ? new Types.ObjectId(String(input.brandId)) : undefined,
    createdById: new Types.ObjectId(String(input.createdById)),
    name: input.name,
    description: input.description,
    styleDescriptors: input.styleDescriptors,
    personality: input.personality,
    referenceImages: input.referenceImages ?? [],
    voice: input.voice,
    avatar: input.avatar,
    negativePrompt: input.negativePrompt,
    loraModelId: input.loraModelId,
  });
}

export async function getCharacterForOrg(
  characterId: Types.ObjectId | string
) {
  await connectMongoose();
  return AiCharacter.findOne({
    _id: characterId
  });
}

export interface UpdateCharacterInput {
  name?: string;
  description?: string;
  styleDescriptors?: string[];
  personality?: string;
  referenceImages?: IAiCharacterReferenceImage[];
  voice?: IAiCharacterVoice;
  avatar?: IAiCharacterAvatar;
  negativePrompt?: string;
  loraModelId?: string;
  status?: 'active' | 'archived';
}

export async function updateCharacter(
  characterId: Types.ObjectId | string,
  patch: UpdateCharacterInput,
) {
  await connectMongoose();
  const set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) set[k] = v;
  }
  return AiCharacter.findOneAndUpdate(
    { _id: characterId },
    { $set: set },
    { new: true },
  );
}

export async function archiveCharacter(
  characterId: Types.ObjectId | string
) {
  return updateCharacter(characterId, { status: 'archived' });
}
