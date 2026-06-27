import mongoose, { Types } from 'mongoose';
import CrmComment, { ICrmComment } from '../../models/crm/comment.model';

export interface CreateCommentDto {
  targetType: 'contact' | 'company' | 'deal' | 'activity';
  targetId: string;
  body: string;
  bodyPlain: string;
  mentions?: string[];
  parentId?: string;
  createdById: string;
}

export interface UpdateCommentDto {
  body?: string;
  bodyPlain?: string;
  mentions?: string[];
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

export class CommentRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmComment | null> {
    await this.ensureConnection();
    return CrmComment.findOne({ _id: id, isDeleted: { $ne: true } }).exec();
  }

  async findByTarget(
    targetType: 'contact' | 'company' | 'deal' | 'activity',
    targetId: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmComment>> {
    await this.ensureConnection();

    const { page = 1, limit = 25 } = options;
    const skip = (page - 1) * limit;

    const query = {
      targetType,
      targetId: new Types.ObjectId(targetId),
      parentId: { $exists: false },
      isDeleted: { $ne: true },
    };

    const [data, total] = await Promise.all([
      CrmComment.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      CrmComment.countDocuments(query).exec(),
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

  async findReplies(
    parentId: string
  ): Promise<ICrmComment[]> {
    await this.ensureConnection();
    return CrmComment.find({
      parentId: new Types.ObjectId(parentId),
      isDeleted: { $ne: true },
    })
      .sort({ createdAt: 1 })
      .exec();
  }

  async findMentions(
    userId: string,
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<ICrmComment>> {
    await this.ensureConnection();

    const { page = 1, limit = 25 } = options;
    const skip = (page - 1) * limit;

    const query = {
      mentions: new Types.ObjectId(userId),
      isDeleted: { $ne: true },
    };

    const [data, total] = await Promise.all([
      CrmComment.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      CrmComment.countDocuments(query).exec(),
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

  async create(data: CreateCommentDto): Promise<ICrmComment> {
    await this.ensureConnection();

    const comment = new CrmComment({
      targetType: data.targetType,
      targetId: new Types.ObjectId(data.targetId),
      body: data.body,
      bodyPlain: data.bodyPlain,
      mentions: data.mentions?.map(id => new Types.ObjectId(id)) || [],
      parentId: data.parentId ? new Types.ObjectId(data.parentId) : undefined,
      createdById: new Types.ObjectId(data.createdById),
    });

    const saved = await comment.save();

    // Increment reply count on parent if this is a reply
    if (data.parentId) {
      await CrmComment.updateOne(
        { _id: data.parentId },
        { $inc: { replyCount: 1 } }
      ).exec();
    }

    return saved;
  }

  async update(
    id: string,
    data: UpdateCommentDto
  ): Promise<ICrmComment | null> {
    await this.ensureConnection();

    const updateData: Record<string, unknown> = {
      ...data,
      isEdited: true,
      editedAt: new Date(),
    };

    if (data.mentions) {
      updateData.mentions = data.mentions.map(id => new Types.ObjectId(id));
    }

    return CrmComment.findOneAndUpdate(
      { _id: id, isDeleted: { $ne: true } },
      { $set: updateData },
      { new: true }
    ).exec();
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();

    const comment = await CrmComment.findOne({ _id: id }).exec();
    if (!comment) return false;

    // Soft delete
    await CrmComment.updateOne(
      { _id: id },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    ).exec();

    // Decrement reply count on parent if this was a reply
    if (comment.parentId) {
      await CrmComment.updateOne(
        { _id: comment.parentId },
        { $inc: { replyCount: -1 } }
      ).exec();
    }

    return true;
  }

  async addReaction(
    id: string,
    userId: string,
    emoji: string
  ): Promise<ICrmComment | null> {
    await this.ensureConnection();

    // First try to add user to existing reaction
    const result = await CrmComment.findOneAndUpdate(
      {
        _id: id,
        'reactions.emoji': emoji,
      },
      {
        $addToSet: { 'reactions.$.userIds': new Types.ObjectId(userId) },
      },
      { new: true }
    ).exec();

    if (result) return result;

    // If reaction doesn't exist, create it
    return CrmComment.findOneAndUpdate(
      { _id: id },
      {
        $push: {
          reactions: {
            emoji,
            userIds: [new Types.ObjectId(userId)],
          },
        },
      },
      { new: true }
    ).exec();
  }

  async removeReaction(
    id: string,
    userId: string,
    emoji: string
  ): Promise<ICrmComment | null> {
    await this.ensureConnection();

    return CrmComment.findOneAndUpdate(
      { _id: id, 'reactions.emoji': emoji },
      {
        $pull: { 'reactions.$.userIds': new Types.ObjectId(userId) },
      },
      { new: true }
    ).exec();
  }

  async countByTarget(
    targetType: string,
    targetId: string
  ): Promise<number> {
    await this.ensureConnection();
    return CrmComment.countDocuments({
      targetType,
      targetId: new Types.ObjectId(targetId),
      isDeleted: { $ne: true },
    }).exec();
  }
}

export const commentRepository = new CommentRepository();
