/**
 * Voice provider configuration.
 *
 * Stores encrypted credentials at four scopes:
 *   - `system`   — super-admin default (one row per provider).
 *   - `org`      — per-org override (organizationId required).
 *   - `brand`    — per-brand override in agency mode (organizationId + brandId).
 *   - `user`     — BYOK credential (organizationId + userId).
 *
 * Encryption uses the existing workflow credential-encryption service, keyed
 * by the credential's owning userId. For `system` scope, the encryption userId
 * is the super-admin who saved the credential (stored in `ownerUserId`).
 */

import mongoose, { Schema, Document, Model, Types } from 'mongoose';

import type { VoiceProviderId } from '@/lib/voice/types';

export type VoiceProviderConfigScope = 'system' | 'org' | 'brand' | 'user';

export interface IVoiceProviderConfig extends Document {
  scope: VoiceProviderConfigScope;
  providerId: VoiceProviderId;
  /** Required when scope is `brand`. Nullable for forward compatibility with B3 agency mode. */
  brandId?: Types.ObjectId | null;
  /** Required when scope is `user` (BYOK). */
  userId?: Types.ObjectId | null;

  /** The user whose userId is used to derive the encryption key. */
  ownerUserId: Types.ObjectId;

  displayName: string;
  enabled: boolean;

  // Encrypted credential payload (mirrors EncryptedData from credential-encryption.ts).
  encryptedValue: string;
  iv: string;
  authTag: string;
  salt: string;

  /** Public metadata (account SID, region, default caller ID, capability flags). */
  metadata: Record<string, unknown>;

  /** Per-minute pricing snapshot for cost reconciliation (USD). */
  pricePerMinuteUsd?: number;

  createdAt: Date;
  updatedAt: Date;
}

const VoiceProviderConfigSchema = new Schema<IVoiceProviderConfig>(
  {
    scope: {
      type: String,
      enum: ['system', 'org', 'brand', 'user'],
      required: true,
      index: true,
    },
    providerId: {
      type: String,
      required: true,
      index: true,
    },
    brandId: {
      type: Schema.Types.ObjectId,
      ref: 'Brand',
      default: null,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    encryptedValue: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    salt: { type: String, required: true },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    pricePerMinuteUsd: { type: Number },
  },
  { timestamps: true, collection: 'voice_provider_configs' },
);

// Unique constraints per scope. Sparse on the optional fields so multiple
// system-scope rows can coexist (one per provider) without conflicting nulls.
VoiceProviderConfigSchema.index(
  { scope: 1, providerId: 1, brandId: 1, userId: 1 },
  { unique: true, name: 'voice_provider_config_uniqueness' },
);

// Common lookup paths.
VoiceProviderConfigSchema.index({ enabled: 1, scope: 1 });
VoiceProviderConfigSchema.index({ userId: 1, enabled: 1 });

if (process.env.NODE_ENV === 'development' && mongoose.models.VoiceProviderConfig) {
  delete mongoose.models.VoiceProviderConfig;
}

const VoiceProviderConfig: Model<IVoiceProviderConfig> =
  mongoose.models.VoiceProviderConfig
  || mongoose.model<IVoiceProviderConfig>('VoiceProviderConfig', VoiceProviderConfigSchema);

export default VoiceProviderConfig;
