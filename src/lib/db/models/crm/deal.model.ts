import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IDealStageHistory {
  stageId: Types.ObjectId;
  stageName: string;
  enteredAt: Date;
  exitedAt?: Date;
  duration?: number; // Duration in milliseconds
}

export interface IDealRichNotes {
  content?: string;
  plainText?: string;
  updatedAt?: Date;
  updatedById?: Types.ObjectId;
}

export interface ICrmDeal extends Document {
  // Relationships
  contactId?: Types.ObjectId;
  companyId?: Types.ObjectId;
  pipelineId: Types.ObjectId;
  stageId: Types.ObjectId;

  // Deal Information
  name: string;
  description?: string;

  // Value
  value: number;
  currency: string;

  // Probability & Dates
  probability: number;
  expectedCloseDate?: Date;
  actualCloseDate?: Date;

  // Status
  status: 'open' | 'won' | 'lost' | 'abandoned';
  lostReason?: string;
  wonReason?: string;

  // Assignment
  ownerId?: Types.ObjectId;
  assignedAt?: Date;

  // Categorization
  tags: Types.ObjectId[];
  customFields: Record<string, unknown>;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  source?: string;

  // Activity Tracking
  lastActivityAt?: Date;
  nextActivityAt?: Date;
  totalActivities: number;

  // Stage History
  stageHistory: IDealStageHistory[];

  // Rich Notes
  notes?: IDealRichNotes;

  // Soft delete (trash & restore)
  deletedAt?: Date;
  deletedById?: Types.ObjectId;

  // Metadata
  createdById: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DealStageHistorySchema = new Schema({
  stageId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  stageName: {
    type: String,
    required: true,
  },
  enteredAt: {
    type: Date,
    required: true,
  },
  exitedAt: {
    type: Date,
  },
  duration: {
    type: Number,
  },
}, { _id: false });

const DealRichNotesSchema = new Schema({
  content: String,
  plainText: String,
  updatedAt: Date,
  updatedById: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
}, { _id: false });

const CrmDealSchema = new Schema<ICrmDeal>(
  {
    contactId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmContact',
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmCompany',
    },
    pipelineId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmPipeline',
      required: true,
    },
    stageId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    value: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
    },
    probability: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    expectedCloseDate: {
      type: Date,
    },
    actualCloseDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['open', 'won', 'lost', 'abandoned'],
      default: 'open',
    },
    lostReason: {
      type: String,
      trim: true,
    },
    wonReason: {
      type: String,
      trim: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    assignedAt: {
      type: Date,
    },
    tags: [{
      type: Schema.Types.ObjectId,
      ref: 'CrmTag',
    }],
    customFields: {
      type: Schema.Types.Mixed,
      default: {},
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    source: {
      type: String,
      trim: true,
    },
    lastActivityAt: {
      type: Date,
    },
    nextActivityAt: {
      type: Date,
    },
    totalActivities: {
      type: Number,
      default: 0,
    },
    stageHistory: {
      type: [DealStageHistorySchema],
      default: [],
    },
    notes: {
      type: DealRichNotesSchema,
    },
    deletedAt: {
      type: Date,
      default: undefined,
    },
    deletedById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    createdById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'crm_deals',
  }
);

// Org-scoped trash queries — only indexes soft-deleted rows.
CrmDealSchema.index(
  { deletedAt: 1 },
  { partialFilterExpression: { deletedAt: { $exists: true } } }
);

// Indexes
CrmDealSchema.index({ pipelineId: 1, stageId: 1 });
CrmDealSchema.index({ status: 1 });
CrmDealSchema.index({ ownerId: 1, status: 1 });
CrmDealSchema.index({ contactId: 1 });
CrmDealSchema.index({ companyId: 1 });
CrmDealSchema.index({ expectedCloseDate: 1 });
CrmDealSchema.index({ tags: 1 });
CrmDealSchema.index({ createdAt: -1 });
CrmDealSchema.index({ value: -1 });

// Text index for search
CrmDealSchema.index(
  { name: 'text', description: 'text', 'notes.plainText': 'text' },
  { name: 'deal_text_search' }
);

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmDeal) {
    delete mongoose.models.CrmDeal;
  }
}

const CrmDeal: Model<ICrmDeal> =
  mongoose.models.CrmDeal || mongoose.model<ICrmDeal>('CrmDeal', CrmDealSchema);

export default CrmDeal;
