/**
 * Voice phone numbers owned by an organization (and optionally a brand).
 *
 * Holds the routing decision for inbound calls — which workflow, AI bot, or
 * human queue handles a call landing at this number.
 */

import mongoose, { Schema, Document, Model, Types } from 'mongoose';

import type { VoiceProviderId } from '@/lib/voice/types';

export type VoiceNumberCapability = 'voice' | 'sms' | 'mms' | 'fax';

export type VoiceInboundRoutingType =
  | 'workflow'
  | 'ai_bot'
  | 'human_queue'
  | 'forward'
  | 'voicemail'
  | 'disabled';

export interface IVoiceInboundRouting {
  type: VoiceInboundRoutingType;
  /** workflowId / aiBotId / queueId / E.164 forward target. */
  targetId?: string;
  /** Greeting played before routing. */
  greetingAudioUrl?: string;
  /** Max ring time before falling back. */
  maxRingSeconds?: number;
  /** Fallback when `targetId` is unavailable. */
  fallback?: {
    type: VoiceInboundRoutingType;
    targetId?: string;
  };
}

export interface IVoicePhoneNumber extends Document {
  /** Optional brand scope for agency mode. Nullable; defaults to org-level. */
  brandId?: Types.ObjectId | null;

  providerId: VoiceProviderId;
  /** Provider's own identifier for this number (e.g. Twilio PN SID). */
  providerNumberId: string;

  /** E.164 normalized phone number. */
  phoneNumber: string;
  friendlyName?: string;
  countryCode?: string;
  region?: string;

  capabilities: VoiceNumberCapability[];

  inboundRouting: IVoiceInboundRouting;

  /** Pricing snapshot for visibility (USD/month + USD/min). */
  monthlyPriceUsd?: number;
  pricePerMinuteUsd?: number;

  status: 'active' | 'suspended' | 'released';
  provisionedAt: Date;
  releasedAt?: Date;

  createdById: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InboundRoutingSchema = new Schema<IVoiceInboundRouting>(
  {
    type: {
      type: String,
      enum: ['workflow', 'ai_bot', 'human_queue', 'forward', 'voicemail', 'disabled'],
      required: true,
      default: 'disabled',
    },
    targetId: { type: String },
    greetingAudioUrl: { type: String },
    maxRingSeconds: { type: Number, default: 30 },
    fallback: {
      type: new Schema(
        {
          type: { type: String, enum: ['workflow', 'ai_bot', 'human_queue', 'forward', 'voicemail', 'disabled'] },
          targetId: { type: String },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { _id: false },
);

const VoicePhoneNumberSchema = new Schema<IVoicePhoneNumber>(
  {
    brandId: {
      type: Schema.Types.ObjectId,
      ref: 'Brand',
      default: null,
      index: true,
    },
    providerId: { type: String, required: true, index: true },
    providerNumberId: { type: String, required: true },
    phoneNumber: { type: String, required: true, trim: true },
    friendlyName: { type: String, trim: true },
    countryCode: { type: String, trim: true },
    region: { type: String, trim: true },
    capabilities: {
      type: [String],
      enum: ['voice', 'sms', 'mms', 'fax'],
      default: ['voice'],
    },
    inboundRouting: { type: InboundRoutingSchema, default: () => ({ type: 'disabled' }) },
    monthlyPriceUsd: { type: Number },
    pricePerMinuteUsd: { type: Number },
    status: {
      type: String,
      enum: ['active', 'suspended', 'released'],
      default: 'active',
      index: true,
    },
    provisionedAt: { type: Date, default: () => new Date() },
    releasedAt: { type: Date },
    createdById: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'voice_phone_numbers' },
);

// One phone number per org (a number can't be owned by two orgs).
VoicePhoneNumberSchema.index({ phoneNumber: 1, status: 1 }, { unique: false });
VoicePhoneNumberSchema.index(
  { providerId: 1, providerNumberId: 1 },
  { unique: true, name: 'voice_phone_provider_unique' },
);
VoicePhoneNumberSchema.index({ brandId: 1, status: 1 });
VoicePhoneNumberSchema.index({ phoneNumber: 1 });

if (process.env.NODE_ENV === 'development' && mongoose.models.VoicePhoneNumber) {
  delete mongoose.models.VoicePhoneNumber;
}

const VoicePhoneNumber: Model<IVoicePhoneNumber> =
  mongoose.models.VoicePhoneNumber
  || mongoose.model<IVoicePhoneNumber>('VoicePhoneNumber', VoicePhoneNumberSchema);

export default VoicePhoneNumber;
