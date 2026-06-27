import mongoose, { Types } from 'mongoose';
import CrmAttachment, { ICrmAttachment } from '../../models/crm/attachment.model';

export interface CreateAttachmentDto {
  targetType: 'contact' | 'company' | 'deal' | 'activity' | 'comment' | 'email';
  targetId: string;
  fileName: string;
  fileKey: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  extension: string;
  description?: string;
  isPublic?: boolean;
  thumbnailUrl?: string;
  thumbnailKey?: string;
  createdById: string;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
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

export class AttachmentRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmAttachment | null> {
    await this.ensureConnection();
    return CrmAttachment.findOne({ _id: id }).exec();
  }

  async findByTarget(
    targetType: string,
    targetId: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmAttachment>> {
    await this.ensureConnection();

    const { page = 1, limit = 25 } = options;
    const skip = (page - 1) * limit;

    const query = {
      targetType,
      targetId: new Types.ObjectId(targetId),
    };

    const [data, total] = await Promise.all([
      CrmAttachment.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      CrmAttachment.countDocuments(query).exec(),
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

  async create(data: CreateAttachmentDto): Promise<ICrmAttachment> {
    await this.ensureConnection();

    const attachment = new CrmAttachment({
      targetType: data.targetType,
      targetId: new Types.ObjectId(data.targetId),
      fileName: data.fileName,
      fileKey: data.fileKey,
      fileUrl: data.fileUrl,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      extension: data.extension,
      description: data.description,
      isPublic: data.isPublic || false,
      thumbnailUrl: data.thumbnailUrl,
      thumbnailKey: data.thumbnailKey,
      scanStatus: 'pending',
      createdById: new Types.ObjectId(data.createdById),
    });

    return attachment.save();
  }

  async updateScanStatus(
    id: string,
    status: 'pending' | 'clean' | 'infected' | 'error'
  ): Promise<ICrmAttachment | null> {
    await this.ensureConnection();
    return CrmAttachment.findByIdAndUpdate(
      id,
      { $set: { scanStatus: status, scannedAt: new Date() } },
      { new: true }
    ).exec();
  }

  async updateDescription(
    id: string,
    description: string
  ): Promise<ICrmAttachment | null> {
    await this.ensureConnection();
    return CrmAttachment.findOneAndUpdate(
      { _id: id },
      { $set: { description } },
      { new: true }
    ).exec();
  }

  async delete(id: string): Promise<ICrmAttachment | null> {
    await this.ensureConnection();
    return CrmAttachment.findOneAndDelete({ _id: id }).exec();
  }

  async deleteByTarget(
    targetType: string,
    targetId: string
  ): Promise<number> {
    await this.ensureConnection();
    const result = await CrmAttachment.deleteMany({
      targetType,
      targetId: new Types.ObjectId(targetId),
    }).exec();
    return result.deletedCount;
  }

  async countByTarget(
    targetType: string,
    targetId: string
  ): Promise<number> {
    await this.ensureConnection();
    return CrmAttachment.countDocuments({
      targetType,
      targetId: new Types.ObjectId(targetId),
    }).exec();
  }

  async getTotalSize(): Promise<number> {
    await this.ensureConnection();
    const result = await CrmAttachment.aggregate([
      { $match: { } },
      { $group: { _id: null, totalSize: { $sum: '$fileSize' } } },
    ]).exec();
    return result[0]?.totalSize || 0;
  }
}

export const attachmentRepository = new AttachmentRepository();
