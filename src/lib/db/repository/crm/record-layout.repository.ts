import mongoose, { Types } from 'mongoose';
import CrmRecordLayout, {
  ICrmRecordLayout,
  IRecordLayoutSection,
} from '../../models/crm/record-layout.model';

export type RecordLayoutEntity = 'contact' | 'company' | 'deal';

export interface UpsertRecordLayoutDto {
  entityType: RecordLayoutEntity;
  sections: IRecordLayoutSection[];
  updatedById?: string;
}

export class RecordLayoutRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  /** The saved layout for an org + entity, or null if none stored. */
  async get(
    entityType: RecordLayoutEntity
  ): Promise<ICrmRecordLayout | null> {
    await this.ensureConnection();
    return CrmRecordLayout.findOne({ entityType }).lean<ICrmRecordLayout>().exec();
  }

  /** Create or replace the org's layout document for an entity. */
  async upsert(dto: UpsertRecordLayoutDto): Promise<ICrmRecordLayout> {
    await this.ensureConnection();
    const doc = await CrmRecordLayout.findOneAndUpdate(
      { entityType: dto.entityType },
      {
        $set: {
          sections: dto.sections,
          ...(dto.updatedById ? { updatedById: new Types.ObjectId(dto.updatedById) } : {}),
        },
        $setOnInsert: {
          entityType: dto.entityType,
        },
      },
      { new: true, upsert: true }
    )
      .lean<ICrmRecordLayout>()
      .exec();
    return doc as ICrmRecordLayout;
  }
}

export const recordLayoutRepository = new RecordLayoutRepository();
