import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IImportError {
  row: number;
  error: string;
  data?: Record<string, unknown>;
}

export interface ICrmImport extends Document {
  entityType: 'contact' | 'company';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

  // File Info
  fileName: string;
  fileUrl?: string;
  fileSize?: number;

  // Mapping
  fieldMapping: Record<string, string>;

  // Progress
  totalRows: number;
  processedRows: number;
  successCount: number;
  errorCount: number;
  duplicateCount: number;
  importErrors: IImportError[];

  // Settings
  duplicateHandling: 'skip' | 'update' | 'create';
  duplicateField?: string;
  defaultOwnerId?: Types.ObjectId;
  defaultTags: Types.ObjectId[];
  createCompanies: boolean;

  startedAt?: Date;
  completedAt?: Date;
  createdById: Types.ObjectId;
  createdAt: Date;
}

const ImportErrorSchema = new Schema({
  row: {
    type: Number,
    required: true,
  },
  error: {
    type: String,
    required: true,
  },
  data: Schema.Types.Mixed,
}, { _id: false });

const CrmImportSchema = new Schema<ICrmImport>(
  {
    entityType: {
      type: String,
      enum: ['contact', 'company'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'pending',
    },
    fileName: {
      type: String,
      required: true,
    },
    fileUrl: String,
    fileSize: Number,
    fieldMapping: {
      type: Schema.Types.Mixed,
      default: {},
    },
    totalRows: {
      type: Number,
      default: 0,
    },
    processedRows: {
      type: Number,
      default: 0,
    },
    successCount: {
      type: Number,
      default: 0,
    },
    errorCount: {
      type: Number,
      default: 0,
    },
    duplicateCount: {
      type: Number,
      default: 0,
    },
    importErrors: {
      type: [ImportErrorSchema],
      default: [],
    },
    duplicateHandling: {
      type: String,
      enum: ['skip', 'update', 'create'],
      default: 'skip',
    },
    duplicateField: String,
    defaultOwnerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    defaultTags: [{
      type: Schema.Types.ObjectId,
      ref: 'CrmTag',
    }],
    createCompanies: {
      type: Boolean,
      default: false,
    },
    startedAt: Date,
    completedAt: Date,
    createdById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'crm_imports',
  }
);

// Indexes
CrmImportSchema.index({ status: 1 });
CrmImportSchema.index({ createdAt: -1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmImport) {
    delete mongoose.models.CrmImport;
  }
}

const CrmImport: Model<ICrmImport> =
  mongoose.models.CrmImport || mongoose.model<ICrmImport>('CrmImport', CrmImportSchema);

export default CrmImport;
