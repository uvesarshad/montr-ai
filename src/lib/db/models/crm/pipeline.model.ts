import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IPipelineStage {
  _id: Types.ObjectId;
  name: string;
  order: number;
  probability: number;
  color: string;
  type: 'open' | 'won' | 'lost';
  rottenDays?: number;
}

export interface ICrmPipeline extends Document {
  name: string;
  description?: string;
  isDefault: boolean;
  isActive: boolean;

  // Stages (embedded)
  stages: IPipelineStage[];

  // Settings
  currency: string;
  dealRotting: boolean;

  // Metadata
  createdById: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PipelineStageSchema = new Schema({
  _id: {
    type: Schema.Types.ObjectId,
    default: () => new Types.ObjectId(),
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  order: {
    type: Number,
    required: true,
  },
  probability: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  color: {
    type: String,
    default: '#6366f1', // Indigo
  },
  type: {
    type: String,
    enum: ['open', 'won', 'lost'],
    default: 'open',
  },
  rottenDays: {
    type: Number,
  },
});

const CrmPipelineSchema = new Schema<ICrmPipeline>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    stages: {
      type: [PipelineStageSchema],
      default: [],
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
    },
    dealRotting: {
      type: Boolean,
      default: false,
    },
    createdById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'crm_pipelines',
  }
);

// Indexes
CrmPipelineSchema.index({ name: 1 }, { unique: true });
CrmPipelineSchema.index({ isDefault: 1 });
CrmPipelineSchema.index({ isActive: 1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmPipeline) {
    delete mongoose.models.CrmPipeline;
  }
}

const CrmPipeline: Model<ICrmPipeline> =
  mongoose.models.CrmPipeline || mongoose.model<ICrmPipeline>('CrmPipeline', CrmPipelineSchema);

export default CrmPipeline;
