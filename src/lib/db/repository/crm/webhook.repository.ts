import mongoose, { Types } from 'mongoose';
import CrmWebhook, { ICrmWebhook, ICrmWebhookLog, CrmWebhookLog, WebhookEvent, IWebhookFilter } from '../../models/crm/webhook.model';

export interface CreateWebhookDto {
  name: string;
  description?: string;
  url: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  secret?: string;
  events: WebhookEvent[];
  filters?: IWebhookFilter[];
  maxRetries?: number;
  retryDelaySeconds?: number;
  createdById: string;
}

export interface UpdateWebhookDto {
  name?: string;
  description?: string;
  url?: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  secret?: string;
  events?: WebhookEvent[];
  filters?: IWebhookFilter[];
  maxRetries?: number;
  retryDelaySeconds?: number;
  isActive?: boolean;
}

export interface CreateWebhookLogDto {
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  statusCode?: number;
  response?: string;
  success: boolean;
  attemptNumber: number;
}

export class WebhookRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmWebhook | null> {
    await this.ensureConnection();
    return CrmWebhook.findOne({ _id: id }).exec();
  }

  async findAll(activeOnly: boolean = false): Promise<ICrmWebhook[]> {
    await this.ensureConnection();
    const query: Record<string, unknown> = { };
    if (activeOnly) {
      query.isActive = true;
    }
    return CrmWebhook.find(query).sort({ name: 1 }).exec();
  }

  async findByEvent(event: WebhookEvent): Promise<ICrmWebhook[]> {
    await this.ensureConnection();
    return CrmWebhook.find({
      isActive: true,
      events: event,
    }).exec();
  }

  async create(data: CreateWebhookDto): Promise<ICrmWebhook> {
    await this.ensureConnection();

    const webhook = new CrmWebhook({
      name: data.name,
      description: data.description,
      isActive: true,
      url: data.url,
      method: data.method || 'POST',
      headers: data.headers || {},
      secret: data.secret,
      events: data.events,
      filters: data.filters || [],
      maxRetries: data.maxRetries || 3,
      retryDelaySeconds: data.retryDelaySeconds || 60,
      deliveryCount: 0,
      failureCount: 0,
      createdById: new Types.ObjectId(data.createdById),
    });

    return webhook.save();
  }

  async update(
    id: string,
    data: UpdateWebhookDto
  ): Promise<ICrmWebhook | null> {
    await this.ensureConnection();
    return CrmWebhook.findOneAndUpdate(
      { _id: id },
      { $set: data },
      { new: true }
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmWebhook.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  async recordDelivery(
    id: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    await this.ensureConnection();

    const update: Record<string, unknown> = {
      $inc: success ? { deliveryCount: 1 } : { failureCount: 1 },
    };

    if (success) {
      update.$set = { lastDeliveredAt: new Date() };
    } else {
      update.$set = { lastFailedAt: new Date(), lastError: error };
    }

    await CrmWebhook.updateOne({ _id: id }, update).exec();
  }

  // Webhook Log methods
  async createLog(data: CreateWebhookLogDto): Promise<ICrmWebhookLog> {
    await this.ensureConnection();

    const log = new CrmWebhookLog({
      webhookId: new Types.ObjectId(data.webhookId),
      event: data.event,
      payload: data.payload,
      statusCode: data.statusCode,
      response: data.response,
      success: data.success,
      attemptNumber: data.attemptNumber,
    });

    return log.save();
  }

  async findLogs(
    webhookId: string,
    options: { page?: number; limit?: number } = {}
  ): Promise<{ data: ICrmWebhookLog[]; total: number }> {
    await this.ensureConnection();

    const { page = 1, limit = 25 } = options;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      CrmWebhookLog.find({ webhookId: new Types.ObjectId(webhookId) })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      CrmWebhookLog.countDocuments({ webhookId: new Types.ObjectId(webhookId) }).exec(),
    ]);

    return { data, total };
  }

  async countByOrganization(): Promise<number> {
    await this.ensureConnection();
    return CrmWebhook.countDocuments({ }).exec();
  }
}

export const webhookRepository = new WebhookRepository();
