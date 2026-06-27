import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface ICrmAttachment extends Document {
  // Target
  targetType: 'contact' | 'company' | 'deal' | 'activity' | 'comment' | 'email';
  targetId: Types.ObjectId;

  // File Info
  fileName: string;
  fileKey: string; // S3 object key
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  extension: string;

  // Metadata
  description?: string;
  isPublic: boolean;

  // Thumbnail (for images)
  thumbnailUrl?: string;
  thumbnailKey?: string;

  // Virus scan status
  scanStatus: 'pending' | 'clean' | 'infected' | 'error';
  scannedAt?: Date;

  createdById: Types.ObjectId;
  createdAt: Date;
}

const CrmAttachmentSchema = new Schema<ICrmAttachment>(
  {
    targetType: {
      type: String,
      enum: ['contact', 'company', 'deal', 'activity', 'comment', 'email'],
      required: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    fileKey: {
      type: String,
      required: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    extension: {
      type: String,
      required: true,
    },
    description: String,
    isPublic: {
      type: Boolean,
      default: false,
    },
    thumbnailUrl: String,
    thumbnailKey: String,
    scanStatus: {
      type: String,
      enum: ['pending', 'clean', 'infected', 'error'],
      default: 'pending',
    },
    scannedAt: Date,
    createdById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'crm_attachments',
  }
);

// Indexes
CrmAttachmentSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmAttachment) {
    delete mongoose.models.CrmAttachment;
  }
}

const CrmAttachment: Model<ICrmAttachment> =
  mongoose.models.CrmAttachment || mongoose.model<ICrmAttachment>('CrmAttachment', CrmAttachmentSchema);

export default CrmAttachment;
