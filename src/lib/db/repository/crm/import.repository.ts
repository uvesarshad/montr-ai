import mongoose, { Types } from 'mongoose';
import CrmImport, { ICrmImport, IImportError } from '../../models/crm/import.model';

export interface CreateImportDto {
  entityType: 'contact' | 'company';
  fileName: string;
  fileUrl?: string;
  fileSize?: number;
  fieldMapping: Record<string, string>;
  totalRows: number;
  duplicateHandling?: 'skip' | 'update' | 'create';
  duplicateField?: string;
  defaultOwnerId?: string;
  defaultTags?: string[];
  createCompanies?: boolean;
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

export class ImportRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmImport | null> {
    await this.ensureConnection();
    return CrmImport.findOne({ _id: id }).exec();
  }

  async find(
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmImport>> {
    await this.ensureConnection();

    const { page = 1, limit = 25 } = options;
    const skip = (page - 1) * limit;

    const query = { };

    const [data, total] = await Promise.all([
      CrmImport.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      CrmImport.countDocuments(query).exec(),
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

  async create(data: CreateImportDto): Promise<ICrmImport> {
    await this.ensureConnection();

    const importJob = new CrmImport({
      entityType: data.entityType,
      status: 'pending',
      fileName: data.fileName,
      fileUrl: data.fileUrl,
      fileSize: data.fileSize,
      fieldMapping: data.fieldMapping,
      totalRows: data.totalRows,
      processedRows: 0,
      successCount: 0,
      errorCount: 0,
      duplicateCount: 0,
      importErrors: [],
      duplicateHandling: data.duplicateHandling || 'skip',
      duplicateField: data.duplicateField,
      defaultOwnerId: data.defaultOwnerId ? new Types.ObjectId(data.defaultOwnerId) : undefined,
      defaultTags: data.defaultTags?.map(id => new Types.ObjectId(id)) || [],
      createCompanies: data.createCompanies || false,
      createdById: new Types.ObjectId(data.createdById),
    });

    return importJob.save();
  }

  async updateStatus(
    id: string,
    status: ICrmImport['status']
  ): Promise<ICrmImport | null> {
    await this.ensureConnection();

    const update: Record<string, unknown> = { status };
    if (status === 'processing') {
      update.startedAt = new Date();
    } else if (status === 'completed' || status === 'failed') {
      update.completedAt = new Date();
    }

    return CrmImport.findOneAndUpdate(
      { _id: id },
      { $set: update },
      { new: true }
    ).exec();
  }

  async updateProgress(
    id: string,
    progress: {
      processedRows: number;
      successCount: number;
      errorCount: number;
      duplicateCount: number;
    }
  ): Promise<ICrmImport | null> {
    await this.ensureConnection();
    return CrmImport.findOneAndUpdate(
      { _id: id },
      { $set: progress },
      { new: true }
    ).exec();
  }

  async addError(
    id: string,
    error: IImportError
  ): Promise<void> {
    await this.ensureConnection();
    await CrmImport.updateOne(
      { _id: id },
      { $push: { importErrors: error }, $inc: { errorCount: 1 } }
    ).exec();
  }

  async incrementCounts(
    id: string,
    counts: { success?: number; error?: number; duplicate?: number; processed?: number }
  ): Promise<void> {
    await this.ensureConnection();
    const inc: Record<string, number> = {};
    if (counts.success) inc.successCount = counts.success;
    if (counts.error) inc.errorCount = counts.error;
    if (counts.duplicate) inc.duplicateCount = counts.duplicate;
    if (counts.processed) inc.processedRows = counts.processed;

    await CrmImport.updateOne(
      { _id: id },
      { $inc: inc }
    ).exec();
  }

  async cancel(id: string): Promise<ICrmImport | null> {
    await this.ensureConnection();
    return CrmImport.findOneAndUpdate(
      { _id: id, status: { $in: ['pending', 'processing'] } },
      { $set: { status: 'cancelled', completedAt: new Date() } },
      { new: true }
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmImport.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }
}

export const importRepository = new ImportRepository();
