import mongoose, { Types } from 'mongoose';
import CrmFavorite, { ICrmFavorite } from '../../models/crm/favorite.model';

export interface CreateFavoriteDto {
  userId: string;
  targetType: 'contact' | 'company' | 'deal' | 'view';
  targetId: string;
  folderId?: string;
}

export class FavoriteRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async findById(id: string): Promise<ICrmFavorite | null> {
    await this.ensureConnection();
    return CrmFavorite.findById(id).exec();
  }

  async findByUser(
    userId: string,
    targetType?: 'contact' | 'company' | 'deal' | 'view'
  ): Promise<ICrmFavorite[]> {
    await this.ensureConnection();
    const query: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (targetType) {
      query.targetType = targetType;
    }
    return CrmFavorite.find(query).sort({ order: 1, createdAt: -1 }).exec();
  }

  async exists(
    userId: string,
    targetType: string,
    targetId: string
  ): Promise<boolean> {
    await this.ensureConnection();
    const count = await CrmFavorite.countDocuments({
      userId: new Types.ObjectId(userId),
      targetType,
      targetId: new Types.ObjectId(targetId),
    }).exec();
    return count > 0;
  }

  async create(data: CreateFavoriteDto): Promise<ICrmFavorite> {
    await this.ensureConnection();

    // Get max order for user
    const maxOrder = await CrmFavorite.findOne({
      userId: new Types.ObjectId(data.userId),
      folderId: data.folderId ? new Types.ObjectId(data.folderId) : undefined,
    })
      .sort({ order: -1 })
      .select('order')
      .exec();

    const favorite = new CrmFavorite({
      userId: new Types.ObjectId(data.userId),
      targetType: data.targetType,
      targetId: new Types.ObjectId(data.targetId),
      folderId: data.folderId ? new Types.ObjectId(data.folderId) : undefined,
      order: (maxOrder?.order || 0) + 1,
    });

    return favorite.save();
  }

  async delete(id: string, userId: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmFavorite.deleteOne({
      _id: id,
      userId: new Types.ObjectId(userId),
    }).exec();
    return result.deletedCount > 0;
  }

  async deleteByTarget(
    userId: string,
    targetType: string,
    targetId: string
  ): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmFavorite.deleteOne({
      userId: new Types.ObjectId(userId),
      targetType,
      targetId: new Types.ObjectId(targetId),
    }).exec();
    return result.deletedCount > 0;
  }

  async reorder(
    userId: string,
    favoriteOrder: { id: string; order: number }[]
  ): Promise<void> {
    await this.ensureConnection();
    const bulkOps = favoriteOrder.map(item => ({
      updateOne: {
        filter: { _id: new Types.ObjectId(item.id), userId: new Types.ObjectId(userId) },
        update: { $set: { order: item.order } },
      },
    }));
    await CrmFavorite.bulkWrite(bulkOps);
  }

  async moveToFolder(
    id: string,
    userId: string,
    folderId: string | null
  ): Promise<ICrmFavorite | null> {
    await this.ensureConnection();
    return CrmFavorite.findOneAndUpdate(
      { _id: id, userId: new Types.ObjectId(userId) },
      { $set: { folderId: folderId ? new Types.ObjectId(folderId) : null } },
      { new: true }
    ).exec();
  }

  async countByUser(userId: string): Promise<number> {
    await this.ensureConnection();
    return CrmFavorite.countDocuments({
      userId: new Types.ObjectId(userId),
    }).exec();
  }
}

export const favoriteRepository = new FavoriteRepository();
