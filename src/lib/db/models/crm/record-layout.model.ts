import mongoose, { Schema, Document, Model, Types } from 'mongoose';

/**
 * Per-organization record-detail layout config (Twenty PageLayout-lite).
 *
 * Stores the order + visibility (+ column) of the EXISTING sections on CRM
 * contact/company/deal detail pages. One document per organization +
 * entityType. The catalog of valid section keys lives in
 * `src/components/crm/shared/record-layout-sections.ts`.
 */
export interface IRecordLayoutSection {
  key: string;
  visible: boolean;
  order: number;
  column?: 'main' | 'side';
}

export interface ICrmRecordLayout extends Document {
  entityType: 'contact' | 'company' | 'deal';
  sections: IRecordLayoutSection[];
  updatedById?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RecordLayoutSectionSchema = new Schema(
  {
    key: { type: String, required: true },
    visible: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    column: { type: String, enum: ['main', 'side'] },
  },
  { _id: false }
);

const CrmRecordLayoutSchema = new Schema<ICrmRecordLayout>(
  {
    entityType: {
      type: String,
      enum: ['contact', 'company', 'deal'],
      required: true,
    },
    sections: {
      type: [RecordLayoutSectionSchema],
      default: [],
    },
    updatedById: {
      type: Schema.Types.ObjectId,
    },
  },
  {
    timestamps: true,
    collection: 'crm_record_layouts',
  }
);

// One layout document per org + entity type.
CrmRecordLayoutSchema.index({ entityType: 1 }, { unique: true });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmRecordLayout) {
    delete mongoose.models.CrmRecordLayout;
  }
}

const CrmRecordLayout: Model<ICrmRecordLayout> =
  mongoose.models.CrmRecordLayout ||
  mongoose.model<ICrmRecordLayout>('CrmRecordLayout', CrmRecordLayoutSchema);

export default CrmRecordLayout;
