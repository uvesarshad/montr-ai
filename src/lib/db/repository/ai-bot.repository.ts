/**
 * AiBot repository — CRUD + scoped lookups for AI bot entities (B3-4.5.5).
 */

import mongoose, { Types } from 'mongoose';

import AiBot, { IAiBot, AiBotChannel } from '../models/ai-bot.model';

export interface CreateAiBotDto {
  brandId?: string | Types.ObjectId | null;
  createdById: string | Types.ObjectId;
  name: string;
  description?: string;
  aiCharacterId?: string | Types.ObjectId | null;
  systemPrompt: string;
  knowledgeBaseIds?: (string | Types.ObjectId)[];
  enabledChannels?: AiBotChannel[];
  escalationRules?: IAiBot['escalationRules'];
  routingDefaults?: IAiBot['routingDefaults'];
  llmModel?: string;
  temperature?: number;
}

export interface UpdateAiBotDto {
  name?: string;
  description?: string;
  aiCharacterId?: string | Types.ObjectId | null;
  systemPrompt?: string;
  knowledgeBaseIds?: (string | Types.ObjectId)[];
  enabledChannels?: AiBotChannel[];
  escalationRules?: IAiBot['escalationRules'];
  routingDefaults?: IAiBot['routingDefaults'];
  llmModel?: string;
  temperature?: number;
  status?: 'active' | 'archived';
}

export interface ListAiBotsOptions {
  brandId?: string | Types.ObjectId | null;
  channel?: AiBotChannel;
  status?: 'active' | 'archived';
  limit?: number;
  skip?: number;
}

class AiBotRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async create(dto: CreateAiBotDto): Promise<IAiBot> {
    await this.ensureConnection();
    return AiBot.create({
      brandId: dto.brandId ?? null,
      createdById: dto.createdById,
      name: dto.name,
      description: dto.description,
      aiCharacterId: dto.aiCharacterId ?? null,
      systemPrompt: dto.systemPrompt,
      knowledgeBaseIds: dto.knowledgeBaseIds ?? [],
      enabledChannels: dto.enabledChannels ?? [],
      escalationRules: dto.escalationRules,
      routingDefaults: dto.routingDefaults,
      llmModel: dto.llmModel,
      temperature: dto.temperature,
    });
  }

  async findById(id: string | Types.ObjectId): Promise<IAiBot | null> {
    await this.ensureConnection();
    return AiBot.findById(id).exec();
  }

  async findActiveById(
    id: string | Types.ObjectId,
    channel?: AiBotChannel,
  ): Promise<IAiBot | null> {
    await this.ensureConnection();
    const bot = await AiBot.findOne({ _id: id, status: 'active' }).exec();
    if (!bot) return null;
    if (channel && !bot.enabledChannels.includes(channel)) return null;
    return bot;
  }

  async list(opts: ListAiBotsOptions): Promise<IAiBot[]> {
    await this.ensureConnection();
    const query: Record<string, unknown> = { };
    if (opts.brandId !== undefined) query.brandId = opts.brandId;
    if (opts.channel) query.enabledChannels = opts.channel;
    if (opts.status) query.status = opts.status;
    return AiBot.find(query)
      .sort({ updatedAt: -1 })
      .limit(opts.limit ?? 50)
      .skip(opts.skip ?? 0)
      .exec();
  }

  async update(id: string | Types.ObjectId, dto: UpdateAiBotDto): Promise<IAiBot | null> {
    await this.ensureConnection();
    return AiBot.findByIdAndUpdate(id, dto, { new: true }).exec();
  }

  async archive(id: string | Types.ObjectId): Promise<IAiBot | null> {
    await this.ensureConnection();
    return AiBot.findByIdAndUpdate(id, { status: 'archived' }, { new: true }).exec();
  }

  async delete(id: string | Types.ObjectId): Promise<void> {
    await this.ensureConnection();
    await AiBot.findByIdAndDelete(id).exec();
  }

  async findByCharacterId(
    aiCharacterId: string | Types.ObjectId,
  ): Promise<IAiBot[]> {
    await this.ensureConnection();
    return AiBot.find({ aiCharacterId }).exec();
  }

  async incrementUsage(id: string | Types.ObjectId): Promise<void> {
    await this.ensureConnection();
    await AiBot.updateOne({ _id: id }, { $inc: { usageCount: 1 } }).exec();
  }
}

export const aiBotRepository = new AiBotRepository();
export { AiBotRepository };
