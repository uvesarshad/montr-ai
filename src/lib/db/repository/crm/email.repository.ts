import mongoose, { FilterQuery, Types } from 'mongoose';
import CrmEmail, { ICrmEmail, IEmailAddress } from '../../models/crm/email.model';

export interface CreateEmailDto {
  accountId: string;
  messageId: string;
  threadId?: string;
  from: IEmailAddress;
  to: IEmailAddress[];
  cc?: IEmailAddress[];
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  snippet?: string;
  date: Date;
  folder: string;
  labels?: string[];
  isRead?: boolean;
  isStarred?: boolean;
  direction: 'inbound' | 'outbound';
  contactId?: string;
  companyId?: string;
  dealId?: string;
  hasAttachments?: boolean;
  attachments?: { attachmentId: string; fileName: string; mimeType: string; size: number }[];
}

export interface EmailFilters {
  accountId?: string;
  folder?: string;
  threadId?: string;
  contactId?: string;
  companyId?: string;
  dealId?: string;
  direction?: 'inbound' | 'outbound';
  isRead?: boolean;
  isStarred?: boolean;
  search?: string;
  dateAfter?: Date;
  dateBefore?: Date;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export class EmailRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmEmail | null> {
    await this.ensureConnection();
    return CrmEmail.findOne({ _id: id }).exec();
  }

  async findByMessageId(
    accountId: string,
    messageId: string
  ): Promise<ICrmEmail | null> {
    await this.ensureConnection();
    return CrmEmail.findOne({
      accountId: new Types.ObjectId(accountId),
      messageId,
    }).exec();
  }

  async find(
    filters: EmailFilters = {},
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmEmail>> {
    await this.ensureConnection();

    const { page = 1, limit = 25, sort = 'date', sortDirection = 'desc' } = options;
    const skip = (page - 1) * limit;

    const query: FilterQuery<ICrmEmail> = { };

    if (filters.accountId) {
      query.accountId = new Types.ObjectId(filters.accountId);
    }
    if (filters.folder) {
      query.folder = filters.folder;
    }
    if (filters.threadId) {
      query.threadId = filters.threadId;
    }
    if (filters.contactId) {
      query.contactId = new Types.ObjectId(filters.contactId);
    }
    if (filters.companyId) {
      query.companyId = new Types.ObjectId(filters.companyId);
    }
    if (filters.dealId) {
      query.dealId = new Types.ObjectId(filters.dealId);
    }
    if (filters.direction) {
      query.direction = filters.direction;
    }
    if (filters.isRead !== undefined) {
      query.isRead = filters.isRead;
    }
    if (filters.isStarred !== undefined) {
      query.isStarred = filters.isStarred;
    }
    if (filters.search) {
      query.$text = { $search: filters.search };
    }
    if (filters.dateAfter || filters.dateBefore) {
      query.date = {};
      if (filters.dateAfter) query.date.$gte = filters.dateAfter;
      if (filters.dateBefore) query.date.$lte = filters.dateBefore;
    }

    const sortObj: Record<string, 1 | -1> = { [sort]: sortDirection === 'asc' ? 1 : -1 };

    const [data, total] = await Promise.all([
      CrmEmail.find(query).sort(sortObj).skip(skip).limit(limit).exec(),
      CrmEmail.countDocuments(query).exec(),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }

  async findThread(threadId: string): Promise<ICrmEmail[]> {
    await this.ensureConnection();
    return CrmEmail.find({ threadId }).sort({ date: 1 }).exec();
  }

  async create(data: CreateEmailDto): Promise<ICrmEmail> {
    await this.ensureConnection();

    const email = new CrmEmail({
      accountId: new Types.ObjectId(data.accountId),
      messageId: data.messageId,
      threadId: data.threadId,
      from: data.from,
      to: data.to,
      cc: data.cc,
      replyTo: data.replyTo,
      inReplyTo: data.inReplyTo,
      references: data.references,
      subject: data.subject,
      bodyHtml: data.bodyHtml,
      bodyText: data.bodyText,
      snippet: data.snippet,
      date: data.date,
      receivedAt: new Date(),
      folder: data.folder,
      labels: data.labels,
      isRead: data.isRead ?? false,
      isStarred: data.isStarred ?? false,
      isArchived: false,
      isDraft: false,
      direction: data.direction,
      contactId: data.contactId ? new Types.ObjectId(data.contactId) : undefined,
      companyId: data.companyId ? new Types.ObjectId(data.companyId) : undefined,
      dealId: data.dealId ? new Types.ObjectId(data.dealId) : undefined,
      isLinked: !!(data.contactId || data.companyId || data.dealId),
      hasAttachments: data.hasAttachments ?? false,
      attachments: data.attachments?.map(a => ({
        ...a,
        attachmentId: new Types.ObjectId(a.attachmentId),
      })),
    });

    return email.save();
  }

  async markAsRead(id: string): Promise<ICrmEmail | null> {
    await this.ensureConnection();
    return CrmEmail.findOneAndUpdate(
      { _id: id },
      { $set: { isRead: true } },
      { new: true }
    ).exec();
  }

  async markAsUnread(id: string): Promise<ICrmEmail | null> {
    await this.ensureConnection();
    return CrmEmail.findOneAndUpdate(
      { _id: id },
      { $set: { isRead: false } },
      { new: true }
    ).exec();
  }

  async toggleStar(id: string): Promise<ICrmEmail | null> {
    await this.ensureConnection();
    const email = await CrmEmail.findOne({ _id: id }).exec();
    if (!email) return null;

    return CrmEmail.findOneAndUpdate(
      { _id: id },
      { $set: { isStarred: !email.isStarred } },
      { new: true }
    ).exec();
  }

  async linkToEntity(
    id: string,
    links: { contactId?: string; companyId?: string; dealId?: string }
  ): Promise<ICrmEmail | null> {
    await this.ensureConnection();

    const update: Record<string, unknown> = { isLinked: true };
    if (links.contactId) update.contactId = new Types.ObjectId(links.contactId);
    if (links.companyId) update.companyId = new Types.ObjectId(links.companyId);
    if (links.dealId) update.dealId = new Types.ObjectId(links.dealId);

    return CrmEmail.findOneAndUpdate(
      { _id: id },
      { $set: update },
      { new: true }
    ).exec();
  }

  async updateTracking(
    id: string,
    tracking: { opens?: number; lastOpenedAt?: Date; clicks?: { url: string; count: number; lastClickedAt: Date }[] }
  ): Promise<void> {
    await this.ensureConnection();
    await CrmEmail.updateOne({ _id: id }, { $set: { tracking } }).exec();
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmEmail.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  async countByAccount(accountId: string): Promise<number> {
    await this.ensureConnection();
    return CrmEmail.countDocuments({
      accountId: new Types.ObjectId(accountId),
    }).exec();
  }

  async findByContact(
    contactId: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmEmail>> {
    return this.find({ contactId }, options);
  }

  async countUnread(accountId?: string): Promise<number> {
    await this.ensureConnection();
    const query: Record<string, unknown> = { isRead: false, folder: 'inbox' };
    if (accountId) {
      query.accountId = new Types.ObjectId(accountId);
    }
    return CrmEmail.countDocuments(query).exec();
  }
}

export const emailRepository = new EmailRepository();
