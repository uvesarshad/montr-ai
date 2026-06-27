import mongoose, { Types } from 'mongoose';
import CrmDashboard, {
  ICrmDashboard,
  ICrmDashboardWidget,
} from '../../models/crm/crm-dashboard.model';

export interface UpsertCrmDashboardDto {
  userId: string;
  widgets: ICrmDashboardWidget[];
}

export class CrmDashboardRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  /** The saved dashboard for an org + user, or null if none stored. */
  async get(userId: string): Promise<ICrmDashboard | null> {
    await this.ensureConnection();
    return CrmDashboard.findOne({ userId }).lean<ICrmDashboard>().exec();
  }

  /** Create or replace the user's dashboard document. */
  async upsert(dto: UpsertCrmDashboardDto): Promise<ICrmDashboard> {
    await this.ensureConnection();
    const doc = await CrmDashboard.findOneAndUpdate(
      { userId: dto.userId },
      {
        $set: { widgets: dto.widgets },
        $setOnInsert: {
          userId: new Types.ObjectId(dto.userId),
        },
      },
      { new: true, upsert: true }
    )
      .lean<ICrmDashboard>()
      .exec();
    return doc as ICrmDashboard;
  }
}

export const crmDashboardRepository = new CrmDashboardRepository();
