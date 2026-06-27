/**
 * Call transcript repository.
 */

import mongoose, { Types } from 'mongoose';

import CallTranscript, {
  ICallTranscript,
  ICallTranscriptSegment,
} from '../../models/voice/call-transcript.model';

async function ensureConnection(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();
  }
}

export interface CreateCallTranscriptDto {
  callSessionId: string;
  brandId?: string | null;
  language?: string;
  sttProvider?: string;
}

export class CallTranscriptRepository {
  async create(dto: CreateCallTranscriptDto): Promise<ICallTranscript> {
    await ensureConnection();
    return CallTranscript.create({
      callSessionId: new Types.ObjectId(dto.callSessionId),
      brandId: dto.brandId ? new Types.ObjectId(dto.brandId) : null,
      language: dto.language,
      sttProvider: dto.sttProvider,
      status: 'processing',
      segments: [],
      plainText: '',
    });
  }

  async findByCallSessionId(
    callSessionId: string
  ): Promise<ICallTranscript | null> {
    await ensureConnection();
    return CallTranscript.findOne({
      callSessionId: new Types.ObjectId(callSessionId)
    }).exec();
  }

  async appendSegment(
    transcriptId: string,
    segment: ICallTranscriptSegment,
  ): Promise<ICallTranscript | null> {
    await ensureConnection();
    return CallTranscript.findByIdAndUpdate(
      transcriptId,
      {
        $push: { segments: segment },
        $set: { plainText: undefined }, // recomputed on finalize
      },
      { new: true },
    ).exec();
  }

  async finalize(
    transcriptId: string,
    update: Partial<
      Pick<ICallTranscript, 'plainText' | 'summary' | 'status' | 'errorMessage'>
    >,
  ): Promise<ICallTranscript | null> {
    await ensureConnection();
    const completedAt = update.status === 'ready' || update.status === 'failed'
      ? new Date()
      : undefined;
    return CallTranscript.findByIdAndUpdate(
      transcriptId,
      { ...update, ...(completedAt ? { completedAt } : {}) },
      { new: true },
    ).exec();
  }

  async search(
    query: string,
    limit = 25,
  ): Promise<ICallTranscript[]> {
    await ensureConnection();
    return CallTranscript.find({
      $text: { $search: query },
    })
      .limit(limit)
      .exec();
  }
}

export const callTranscriptRepository = new CallTranscriptRepository();
