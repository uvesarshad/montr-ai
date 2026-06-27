/**
 * Call session repository — create, update, query call sessions.
 */

import mongoose, { FilterQuery, Types } from 'mongoose';

import CallSession, { ICallSession } from '../../models/voice/call-session.model';
import type {
  VoiceCallDirection,
  VoiceCallStatus,
  VoiceProviderId,
} from '@/lib/voice/types';

async function ensureConnection(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();
  }
}

export interface CreateCallSessionDto {
  brandId?: string | null;
  providerId: VoiceProviderId;
  providerCallId?: string;
  providerConfigId?: string;
  direction: VoiceCallDirection;
  fromNumber: string;
  toNumber: string;
  fromContactId?: string | null;
  toContactId?: string | null;
  contactsResolvedByX2?: boolean;
  initiatorType?: ICallSession['initiatorType'];
  initiatorId?: string;
  status?: VoiceCallStatus;
  workflowRunId?: string;
  phoneNumberId?: string;
  customMetadata?: Record<string, unknown>;
}

export interface CallSessionFilters {
  brandId?: string | null;
  direction?: VoiceCallDirection;
  status?: VoiceCallStatus | VoiceCallStatus[];
  contactId?: string;
  phoneNumber?: string;
  startedAfter?: Date;
  startedBefore?: Date;
  workflowRunId?: string;
}

export interface CallSessionPagination {
  page?: number;
  limit?: number;
}

export class CallSessionRepository {
  async create(dto: CreateCallSessionDto): Promise<ICallSession> {
    await ensureConnection();
    return CallSession.create({
      ...dto,
      brandId: dto.brandId ? new Types.ObjectId(dto.brandId) : null,
      providerConfigId: dto.providerConfigId
        ? new Types.ObjectId(dto.providerConfigId)
        : undefined,
      fromContactId: dto.fromContactId ? new Types.ObjectId(dto.fromContactId) : null,
      toContactId: dto.toContactId ? new Types.ObjectId(dto.toContactId) : null,
      phoneNumberId: dto.phoneNumberId ? new Types.ObjectId(dto.phoneNumberId) : undefined,
      status: dto.status ?? 'queued',
      startedAt: new Date(),
    });
  }

  async findById(id: string): Promise<ICallSession | null> {
    await ensureConnection();
    return CallSession.findOne({
      _id: id
    }).exec();
  }

  async findByProviderCallId(
    providerId: VoiceProviderId,
    providerCallId: string,
  ): Promise<ICallSession | null> {
    await ensureConnection();
    return CallSession.findOne({ providerId, providerCallId }).exec();
  }

  async updateProviderCallId(
    id: string,
    providerCallId: string,
  ): Promise<ICallSession | null> {
    await ensureConnection();
    return CallSession.findByIdAndUpdate(id, { providerCallId }, { new: true }).exec();
  }

  async updateStatus(
    id: string,
    update: Partial<
      Pick<
        ICallSession,
        | 'status'
        | 'endReason'
        | 'errorCode'
        | 'errorMessage'
        | 'answeredAt'
        | 'endedAt'
        | 'durationSec'
        | 'recordingUrl'
        | 'recordingDurationSec'
        | 'transcriptId'
        | 'costAmount'
        | 'costCurrency'
        | 'costBreakdown'
        | 'disposition'
      >
    >,
  ): Promise<ICallSession | null> {
    await ensureConnection();
    return CallSession.findByIdAndUpdate(id, update, { new: true }).exec();
  }

  /**
   * Merge keys into customMetadata without overwriting unrelated keys.
   * Used by routing logic to pin per-call hints (aiBotId, characterId, etc.).
   */
  async updateMetadata(
    id: string,
    metadataPatch: Record<string, unknown>,
  ): Promise<ICallSession | null> {
    await ensureConnection();
    const $set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(metadataPatch)) {
      $set[`customMetadata.${k}`] = v;
    }
    return CallSession.findByIdAndUpdate(id, { $set }, { new: true }).exec();
  }

  async list(
    filters: CallSessionFilters = {},
    pagination: CallSessionPagination = {},
  ): Promise<{ data: ICallSession[]; total: number }> {
    await ensureConnection();
    const { page = 1, limit = 25 } = pagination;
    const query: FilterQuery<ICallSession> = {
};

    if (filters.brandId === null) query.brandId = null;
    else if (filters.brandId) query.brandId = new Types.ObjectId(filters.brandId);
    if (filters.direction) query.direction = filters.direction;
    if (filters.status) {
      query.status = Array.isArray(filters.status) ? { $in: filters.status } : filters.status;
    }
    if (filters.contactId) {
      const contactObjId = new Types.ObjectId(filters.contactId);
      query.$or = [{ fromContactId: contactObjId }, { toContactId: contactObjId }];
    }
    if (filters.phoneNumber) {
      query.$or = [
        ...((query.$or as Array<Record<string, unknown>>) ?? []),
        { fromNumber: filters.phoneNumber },
        { toNumber: filters.phoneNumber },
      ];
    }
    if (filters.startedAfter || filters.startedBefore) {
      query.startedAt = {};
      if (filters.startedAfter) query.startedAt.$gte = filters.startedAfter;
      if (filters.startedBefore) query.startedAt.$lte = filters.startedBefore;
    }
    if (filters.workflowRunId) query.workflowRunId = filters.workflowRunId;

    const [data, total] = await Promise.all([
      CallSession.find(query)
        .sort({ startedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      CallSession.countDocuments(query).exec(),
    ]);

    return { data, total };
  }

  /** Used by V-8.4: list calls touching a contact for the standalone history tab. */
  async listForContact(
    contactId: string,
    limit = 50,
  ): Promise<ICallSession[]> {
    await ensureConnection();
    const contactObjId = new Types.ObjectId(contactId);
    return CallSession.find({
      $or: [{ fromContactId: contactObjId }, { toContactId: contactObjId }],
    })
      .sort({ startedAt: -1 })
      .limit(limit)
      .exec();
  }

  /** Used by the X2 backfill job (B3) — paginate over sessions missing contact links. */
  async listForX2Backfill(
    cursor: Date | null,
    limit = 100,
  ): Promise<ICallSession[]> {
    await ensureConnection();
    const query: FilterQuery<ICallSession> = {
      contactsResolvedByX2: { $ne: true },
      $or: [{ fromContactId: null }, { toContactId: null }],
    };
    if (cursor) query.startedAt = { $gt: cursor };
    return CallSession.find(query).sort({ startedAt: 1 }).limit(limit).exec();
  }
}

export const callSessionRepository = new CallSessionRepository();
