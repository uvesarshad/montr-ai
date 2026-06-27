import mongoose, { Types } from 'mongoose';
import CrmRecordLink, { ICrmRecordLink, CrmRecordType } from '../../models/crm/record-link.model';

export interface CreateRecordLinkDto {
  sourceType: CrmRecordType;
  sourceId: string;
  targetType: CrmRecordType;
  targetId: string;
  linkType?: string;
  createdById: string;
}

/**
 * A link annotated relative to a queried record: which direction it points and
 * the "other side" of the association (the record that is NOT the queried one).
 */
export interface AnnotatedRecordLink {
  link: ICrmRecordLink;
  /** 'outgoing' = queried record is the source; 'incoming' = it is the target. */
  direction: 'outgoing' | 'incoming';
  other: { type: CrmRecordType; id: string };
  linkType: string;
}

export class RecordLinkRepository {
  private async ensureConnection(): Promise<void> {
    if (mongoose.connection.readyState !== 1) {
      const { connectMongoose } = await import('@/lib/mongodb');
      await connectMongoose();
    }
  }

  async create(data: CreateRecordLinkDto): Promise<ICrmRecordLink> {
    await this.ensureConnection();
    const link = new CrmRecordLink({
      sourceType: data.sourceType,
      sourceId: new Types.ObjectId(data.sourceId),
      targetType: data.targetType,
      targetId: new Types.ObjectId(data.targetId),
      linkType: data.linkType?.trim() || 'related',
      createdById: new Types.ObjectId(data.createdById),
    });
    return link.save();
  }

  async findById(id: string): Promise<ICrmRecordLink | null> {
    await this.ensureConnection();
    return CrmRecordLink.findOne({ _id: id }).exec();
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await CrmRecordLink.deleteOne({ _id: id }).exec();
    return result.deletedCount > 0;
  }

  /**
   * List all links touching a record (as source OR target), each annotated with
   * direction and the "other side" {type, id}.
   */
  async listForRecord(
    type: CrmRecordType,
    id: string
  ): Promise<AnnotatedRecordLink[]> {
    await this.ensureConnection();
    const recordId = new Types.ObjectId(id);
    const links = await CrmRecordLink.find({
      $or: [
        { sourceType: type, sourceId: recordId },
        { targetType: type, targetId: recordId },
      ],
    })
      .sort({ createdAt: -1 })
      .exec();

    return links.map((link) => {
      const isSource =
        link.sourceType === type && link.sourceId.toString() === id;
      return {
        link,
        direction: isSource ? 'outgoing' : 'incoming',
        other: isSource
          ? { type: link.targetType, id: link.targetId.toString() }
          : { type: link.sourceType, id: link.sourceId.toString() },
        linkType: link.linkType,
      } as AnnotatedRecordLink;
    });
  }

  /** Returns true if an identical link already exists (any linkType match). */
  async exists(
    sourceType: CrmRecordType,
    sourceId: string,
    targetType: CrmRecordType,
    targetId: string,
    linkType: string
  ): Promise<boolean> {
    await this.ensureConnection();
    const count = await CrmRecordLink.countDocuments({
      sourceType,
      sourceId: new Types.ObjectId(sourceId),
      targetType,
      targetId: new Types.ObjectId(targetId),
      linkType,
    }).exec();
    return count > 0;
  }
}

export const recordLinkRepository = new RecordLinkRepository();
