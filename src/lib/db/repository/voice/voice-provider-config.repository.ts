/**
 * Voice provider config repository.
 *
 * Lookups for the registry's selection chain:
 *   BYOK → brand → org → plan → system.
 *
 * The `plan` lookup is intentionally left as a TODO until V-0.2 lands the
 * plan-tier matrix; until then it returns null and selection falls through to
 * the system default.
 */

import mongoose, { Types } from 'mongoose';

import type {
  VoiceProviderCredential,
  VoiceProviderId,
} from '@/lib/voice/types';
import type { VoiceProviderConfigLookup } from '@/lib/voice/selection';

import VoiceProviderConfig, {
  IVoiceProviderConfig,
} from '../../models/voice/voice-provider-config.model';

async function ensureConnection(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();
  }
}

function toCredential(doc: IVoiceProviderConfig): VoiceProviderCredential {
  return {
    providerId: doc.providerId,
    name: doc.displayName,
    type: 'custom',
    encryptedValue: doc.encryptedValue,
    iv: doc.iv,
    authTag: doc.authTag,
    salt: doc.salt,
    byokUserId: doc.scope === 'user' && doc.userId ? doc.userId.toString() : undefined,
    metadata: {
      ...(doc.metadata ?? {}),
      // The credential decrypter needs a userId — fall back to ownerUserId for
      // non-user scopes so system/org/brand credentials can still decrypt.
      userId: doc.scope === 'user' && doc.userId
        ? doc.userId.toString()
        : doc.ownerUserId.toString(),
      configId: doc._id?.toString(),
      pricePerMinuteUsd: doc.pricePerMinuteUsd,
    },
  };
}

export interface CreateVoiceProviderConfigDto {
  scope: IVoiceProviderConfig['scope'];
  providerId: VoiceProviderId;
  brandId?: string | null;
  userId?: string | null;
  ownerUserId: string;
  displayName: string;
  enabled?: boolean;
  encryptedValue: string;
  iv: string;
  authTag: string;
  salt: string;
  metadata?: Record<string, unknown>;
  pricePerMinuteUsd?: number;
}

export class VoiceProviderConfigRepository implements VoiceProviderConfigLookup {
  async create(dto: CreateVoiceProviderConfigDto): Promise<IVoiceProviderConfig> {
    await ensureConnection();
    return VoiceProviderConfig.create({
      ...dto,
      brandId: dto.brandId ? new Types.ObjectId(dto.brandId) : null,
      userId: dto.userId ? new Types.ObjectId(dto.userId) : null,
      ownerUserId: new Types.ObjectId(dto.ownerUserId),
      enabled: dto.enabled ?? true,
    });
  }

  async findById(id: string): Promise<IVoiceProviderConfig | null> {
    await ensureConnection();
    return VoiceProviderConfig.findById(id).exec();
  }

  async listByScope(
    scope: IVoiceProviderConfig['scope'],
    filters: { brandId?: string; userId?: string } = {},
  ): Promise<IVoiceProviderConfig[]> {
    await ensureConnection();
    const query: Record<string, unknown> = { scope };
    if (filters.brandId) query.brandId = new Types.ObjectId(filters.brandId);
    if (filters.userId) query.userId = new Types.ObjectId(filters.userId);
    return VoiceProviderConfig.find(query).exec();
  }

  async setEnabled(id: string, enabled: boolean): Promise<IVoiceProviderConfig | null> {
    await ensureConnection();
    return VoiceProviderConfig.findByIdAndUpdate(id, { enabled }, { new: true }).exec();
  }

  async deleteById(id: string): Promise<boolean> {
    await ensureConnection();
    const res = await VoiceProviderConfig.deleteOne({ _id: id }).exec();
    return res.deletedCount === 1;
  }

  // --- VoiceProviderConfigLookup implementation ----------------------------

  async findByokCredential(
    userId: string
  ): Promise<VoiceProviderCredential | null> {
    await ensureConnection();
    const doc = await VoiceProviderConfig.findOne({
      scope: 'user',
      enabled: true,
      userId: new Types.ObjectId(userId)
    }).sort({ updatedAt: -1 }).exec();
    return doc ? toCredential(doc) : null;
  }

  async findBrandCredential(
    brandId: string,
  ): Promise<VoiceProviderCredential | null> {
    await ensureConnection();
    const doc = await VoiceProviderConfig.findOne({
      scope: 'brand',
      enabled: true,
      brandId: new Types.ObjectId(brandId),
    }).sort({ updatedAt: -1 }).exec();
    return doc ? toCredential(doc) : null;
  }

  async findOrgCredential(
): Promise<VoiceProviderCredential | null> {
    await ensureConnection();
    const doc = await VoiceProviderConfig.findOne({
      scope: 'org',
      enabled: true
    }).sort({ updatedAt: -1 }).exec();
    return doc ? toCredential(doc) : null;
  }

  async findPlanCredential(
    userId: string,
  ): Promise<VoiceProviderCredential | null> {
    // Read plan features to learn which provider this user's plan grants.
    // Falls back to system default if the plan declares no allowedVoiceProviders.
    try {
      const { getEffectivePlanFeatures } = await import('@/lib/plan-enforcement');
      const features = await getEffectivePlanFeatures(userId);
      if (!features.allowVoice) return null;
      const allowed = features.allowedVoiceProviders ?? [];
      if (allowed.length === 0) return null;

      await ensureConnection();
      // Pick the first enabled system-scope credential whose provider is in
      // the plan's allowed set.
      const doc = await VoiceProviderConfig.findOne({
        scope: 'system',
        enabled: true,
        providerId: { $in: allowed },
      })
        .sort({ updatedAt: -1 })
        .exec();
      return doc ? toCredential(doc) : null;
    } catch (err) {
      console.error('[voice/plan-credential] lookup failed:', err);
      return null;
    }
  }

  async findSystemCredential(): Promise<VoiceProviderCredential | null> {
    await ensureConnection();
    const doc = await VoiceProviderConfig.findOne({
      scope: 'system',
      enabled: true,
    }).sort({ updatedAt: -1 }).exec();
    return doc ? toCredential(doc) : null;
  }
}

export const voiceProviderConfigRepository = new VoiceProviderConfigRepository();
