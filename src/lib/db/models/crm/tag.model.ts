import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface ICrmTag extends Document {
  name: string;
  color: string;
  description?: string;
  type: 'contact' | 'company' | 'deal' | 'all';
  usageCount: number;

  createdById: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CrmTagSchema = new Schema<ICrmTag>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    color: {
      type: String,
      default: '#6366f1', // Indigo
    },
    description: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ['contact', 'company', 'deal', 'all'],
      default: 'all',
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    createdById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'crm_tags',
  }
);

// Indexes
CrmTagSchema.index({ name: 1 }, { unique: true });
CrmTagSchema.index({ type: 1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmTag) {
    delete mongoose.models.CrmTag;
  }
}

const CrmTag: Model<ICrmTag> =
  mongoose.models.CrmTag || mongoose.model<ICrmTag>('CrmTag', CrmTagSchema);

export default CrmTag;
