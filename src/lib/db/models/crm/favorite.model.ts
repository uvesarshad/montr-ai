import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface ICrmFavorite extends Document {
  userId: Types.ObjectId;

  // Target
  targetType: 'contact' | 'company' | 'deal' | 'view';
  targetId: Types.ObjectId;

  // Organization
  folderId?: Types.ObjectId;
  order: number;

  createdAt: Date;
}

const CrmFavoriteSchema = new Schema<ICrmFavorite>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    targetType: {
      type: String,
      enum: ['contact', 'company', 'deal', 'view'],
      required: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    folderId: {
      type: Schema.Types.ObjectId,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'crm_favorites',
  }
);

// Indexes
CrmFavoriteSchema.index(
  { userId: 1, targetType: 1, targetId: 1 },
  { unique: true }
);
CrmFavoriteSchema.index({ userId: 1, folderId: 1, order: 1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmFavorite) {
    delete mongoose.models.CrmFavorite;
  }
}

const CrmFavorite: Model<ICrmFavorite> =
  mongoose.models.CrmFavorite || mongoose.model<ICrmFavorite>('CrmFavorite', CrmFavoriteSchema);

export default CrmFavorite;
