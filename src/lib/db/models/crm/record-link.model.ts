import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type CrmRecordType = 'contact' | 'company' | 'deal';

/**
 * Generic any↔any link between two CRM records (Twenty's MORPH_RELATION
 * equivalent). Additive: existing direct FKs (deal.contactId, contact.companyId,
 * etc.) remain canonical. This powers free-form associations like a contact
 * "referred_by" another contact, or a deal "related" to another deal.
 */
export interface ICrmRecordLink extends Document {
  sourceType: CrmRecordType;
  sourceId: Types.ObjectId;
  targetType: CrmRecordType;
  targetId: Types.ObjectId;
  /** Free-form label: 'referred_by' | 'related' | 'parent' | 'child' | 'duplicate_of' | custom. */
  linkType: string;
  createdById: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RECORD_TYPES: CrmRecordType[] = ['contact', 'company', 'deal'];

const CrmRecordLinkSchema = new Schema<ICrmRecordLink>(
  {
    sourceType: {
      type: String,
      enum: RECORD_TYPES,
      required: true,
    },
    sourceId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    targetType: {
      type: String,
      enum: RECORD_TYPES,
      required: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    linkType: {
      type: String,
      trim: true,
      default: 'related',
    },
    createdById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'crm_record_links',
  }
);

// Lookups where the record is the SOURCE side.
CrmRecordLinkSchema.index({ sourceType: 1, sourceId: 1 });
// Lookups where the record is the TARGET side (reverse direction).
CrmRecordLinkSchema.index({ targetType: 1, targetId: 1 });
// Prevent duplicate links (same pair + same linkType) within an org.
CrmRecordLinkSchema.index(
  { sourceType: 1, sourceId: 1, targetType: 1, targetId: 1, linkType: 1 },
  { unique: true }
);

// Prevent model recompilation in development.
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmRecordLink) {
    delete mongoose.models.CrmRecordLink;
  }
}

const CrmRecordLink: Model<ICrmRecordLink> =
  mongoose.models.CrmRecordLink ||
  mongoose.model<ICrmRecordLink>('CrmRecordLink', CrmRecordLinkSchema);

export default CrmRecordLink;
