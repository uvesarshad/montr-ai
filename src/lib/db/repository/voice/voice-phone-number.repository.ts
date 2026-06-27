/**
 * Voice phone number repository — CRUD and lookups for owned phone numbers.
 */

import mongoose, { FilterQuery, Types } from 'mongoose';

import VoicePhoneNumber, {
  IVoicePhoneNumber,
  IVoiceInboundRouting,
} from '../../models/voice/voice-phone-number.model';
import type { VoiceProviderId } from '@/lib/voice/types';

async function ensureConnection(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();
  }
}

export interface CreatePhoneNumberDto {
  brandId?: string | null;
  providerId: VoiceProviderId;
  providerNumberId: string;
  phoneNumber: string;
  friendlyName?: string;
  countryCode?: string;
  region?: string;
  capabilities?: IVoicePhoneNumber['capabilities'];
  inboundRouting?: IVoiceInboundRouting;
  monthlyPriceUsd?: number;
  pricePerMinuteUsd?: number;
  createdById: string;
}

export interface PhoneNumberFilters {
  brandId?: string | null;
  providerId?: VoiceProviderId;
  status?: IVoicePhoneNumber['status'];
  search?: string;
}

export class VoicePhoneNumberRepository {
  async create(dto: CreatePhoneNumberDto): Promise<IVoicePhoneNumber> {
    await ensureConnection();
    return VoicePhoneNumber.create({
      ...dto,
      brandId: dto.brandId ? new Types.ObjectId(dto.brandId) : null,
      createdById: new Types.ObjectId(dto.createdById),
    });
  }

  async findById(id: string): Promise<IVoicePhoneNumber | null> {
    await ensureConnection();
    return VoicePhoneNumber.findOne({
      _id: id
    }).exec();
  }

  /**
   * Look up a number by its Mongo `_id` without scoping by organizationId.
   * Used by provider webhook handlers where we don't yet know which org owns
   * the call — the row itself carries `organizationId` so subsequent reads
   * stay tenant-aware.
   */
  async findByIdUnsafe(id: string): Promise<IVoicePhoneNumber | null> {
    await ensureConnection();
    if (!Types.ObjectId.isValid(id)) return null;
    return VoicePhoneNumber.findById(id).exec();
  }

  async findByNumber(
    phoneNumber: string
  ): Promise<IVoicePhoneNumber | null> {
    await ensureConnection();
    const query: FilterQuery<IVoicePhoneNumber> = { phoneNumber };
    return VoicePhoneNumber.findOne(query).exec();
  }

  /** Used by inbound webhook handlers: find which org owns the dialed number. */
  async findOwnerByNumber(phoneNumber: string): Promise<IVoicePhoneNumber | null> {
    await ensureConnection();
    return VoicePhoneNumber.findOne({ phoneNumber, status: 'active' }).exec();
  }

  async list(
    filters: PhoneNumberFilters = {},
  ): Promise<IVoicePhoneNumber[]> {
    await ensureConnection();
    const query: FilterQuery<IVoicePhoneNumber> = {
};
    if (filters.brandId === null) {
      query.brandId = null;
    } else if (filters.brandId) {
      query.brandId = new Types.ObjectId(filters.brandId);
    }
    if (filters.providerId) query.providerId = filters.providerId;
    if (filters.status) query.status = filters.status;
    if (filters.search) {
      query.$or = [
        { phoneNumber: new RegExp(filters.search, 'i') },
        { friendlyName: new RegExp(filters.search, 'i') },
      ];
    }
    return VoicePhoneNumber.find(query).sort({ createdAt: -1 }).exec();
  }

  async setInboundRouting(
    id: string,
    routing: IVoiceInboundRouting,
  ): Promise<IVoicePhoneNumber | null> {
    await ensureConnection();
    return VoicePhoneNumber.findOneAndUpdate(
      { _id: id },
      { inboundRouting: routing },
      { new: true },
    ).exec();
  }

  async release(id: string): Promise<IVoicePhoneNumber | null> {
    await ensureConnection();
    return VoicePhoneNumber.findOneAndUpdate(
      { _id: id },
      { status: 'released', releasedAt: new Date() },
      { new: true },
    ).exec();
  }
}

export const voicePhoneNumberRepository = new VoicePhoneNumberRepository();
