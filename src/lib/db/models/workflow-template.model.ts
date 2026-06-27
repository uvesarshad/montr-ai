import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { IWorkflowNode, IWorkflowEdge, IWorkflowVariable, IWorkflowTrigger } from './unified-workflow.model';

/**
 * Workflow Template Model
 *
 * Stores reusable workflow templates for the template marketplace.
 * Templates can be installed by users and customized.
 */

export enum TemplateCategory {
  MARKETING = 'marketing',
  SALES = 'sales',
  SUPPORT = 'support',
  OPERATIONS = 'operations',
  AUTOMATION = 'automation',
  ONBOARDING = 'onboarding',
  ENGAGEMENT = 'engagement',
  NURTURE = 'nurture',
  RETENTION = 'retention',
  OTHER = 'other'
}

export enum TemplateDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  ADVANCED = 'advanced'
}

export interface ITemplateRequirement {
  type: 'integration' | 'field' | 'credential' | 'feature';
  name: string;
  description: string;
  required: boolean;
}

export interface ITemplateParameter {
  key: string;
  label: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect';
  required: boolean;
  defaultValue?: unknown;
  options?: Array<{ label: string; value: unknown }>;
  placeholder?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
}

export interface ITemplateReview {
  userId: Types.ObjectId;
  userName: string;
  rating: number;
  comment?: string;
  createdAt: Date;
}

export interface ITemplateInstallation {
  userId: Types.ObjectId;
  workflowId: Types.ObjectId;
  installedAt: Date;
  parameters?: Record<string, unknown>;
}

export interface IWorkflowTemplate extends Document {
  // Basic Information
  name: string;
  description: string;
  longDescription?: string;
  category: TemplateCategory;
  tags: string[];
  difficulty: TemplateDifficulty;

  // Preview
  thumbnailUrl?: string;
  previewImages?: string[];
  previewVideoUrl?: string;

  // Author Information
  authorId: Types.ObjectId;
  authorName: string;
  authorType: 'system' | 'verified' | 'community';
  isOfficial: boolean;
  brandId?: Types.ObjectId;

  // Workflow Definition
  workflowType: 'whatsapp' | 'crm' | 'marketing_email' | 'unified';
  trigger: IWorkflowTrigger;
  nodes: IWorkflowNode[];
  edges: IWorkflowEdge[];
  variables: IWorkflowVariable[];

  // Template Configuration
  parameters: ITemplateParameter[];  // User-configurable parameters
  requirements: ITemplateRequirement[];  // Required integrations/features
  setupInstructions?: string;
  usageGuide?: string;

  // Metadata
  version: number;
  compatibility?: string;  // e.g., "v1.0.0+"
  setupTime?: number;  // Estimated setup time in minutes

  // Stats
  installCount: number;
  viewCount: number;
  favoriteCount: number;
  averageRating: number;
  reviewCount: number;

  // Reviews & Installations
  reviews: ITemplateReview[];
  installations: ITemplateInstallation[];

  // Publishing
  isPublished: boolean;
  publishedAt?: Date;
  lastUpdatedAt: Date;

  // Moderation
  isVerified: boolean;
  isFeatured: boolean;
  verifiedAt?: Date;
  verifiedBy?: Types.ObjectId;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// SCHEMAS
// ============================================

const TemplateRequirementSchema = new Schema<ITemplateRequirement>({
  type: {
    type: String,
    required: true,
    enum: ['integration', 'field', 'credential', 'feature']
  },
  name: { type: String, required: true },
  description: { type: String, required: true },
  required: { type: Boolean, default: true }
}, { _id: false });

const TemplateParameterSchema = new Schema<ITemplateParameter>({
  key: { type: String, required: true },
  label: { type: String, required: true },
  description: { type: String, required: true },
  type: {
    type: String,
    required: true,
    enum: ['string', 'number', 'boolean', 'select', 'multiselect']
  },
  required: { type: Boolean, default: true },
  defaultValue: { type: Schema.Types.Mixed },
  options: [{ label: String, value: Schema.Types.Mixed }],
  placeholder: { type: String },
  validation: {
    min: { type: Number },
    max: { type: Number },
    pattern: { type: String },
    message: { type: String }
  }
}, { _id: false });

const TemplateReviewSchema = new Schema<ITemplateReview>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userName: { type: String, required: true },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comment: { type: String },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const TemplateInstallationSchema = new Schema<ITemplateInstallation>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  workflowId: {
    type: Schema.Types.ObjectId,
    ref: 'UnifiedWorkflow',
    required: true
  },
  installedAt: {
    type: Date,
    default: Date.now
  },
  parameters: { type: Schema.Types.Mixed }
}, { _id: false });

const WorkflowTemplateSchema = new Schema<IWorkflowTemplate>(
  {
    // Basic Information
    name: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    longDescription: { type: String },
    category: {
      type: String,
      required: true,
      enum: Object.values(TemplateCategory),
      index: true
    },
    tags: [{ type: String, index: true }],
    difficulty: {
      type: String,
      required: true,
      enum: Object.values(TemplateDifficulty)
    },

    // Preview
    thumbnailUrl: { type: String },
    previewImages: [{ type: String }],
    previewVideoUrl: { type: String },

    // Author Information
    authorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    authorName: { type: String, required: true },
    authorType: {
      type: String,
      required: true,
      enum: ['system', 'verified', 'community'],
      default: 'community'
    },
    isOfficial: {
      type: Boolean,
      default: false,
      index: true
    },
    brandId: {
      type: Schema.Types.ObjectId,
      ref: 'Brand',
      index: true,
    },

    // Workflow Definition
    workflowType: {
      type: String,
      required: true,
      enum: ['whatsapp', 'crm', 'marketing_email', 'unified']
    },
    trigger: { type: Schema.Types.Mixed, required: true },
    // @ts-expect-error
    nodes: { type: [Schema.Types.Mixed], default: [] },
    // @ts-expect-error
    edges: { type: [Schema.Types.Mixed], default: [] },
    // @ts-expect-error
    variables: { type: [Schema.Types.Mixed], default: [] },

    // Template Configuration
    parameters: [TemplateParameterSchema],
    requirements: [TemplateRequirementSchema],
    setupInstructions: { type: String },
    usageGuide: { type: String },

    // Metadata
    version: { type: Number, default: 1 },
    compatibility: { type: String },
    setupTime: { type: Number },

    // Stats
    installCount: { type: Number, default: 0, index: true },
    viewCount: { type: Number, default: 0 },
    favoriteCount: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0, min: 0, max: 5, index: true },
    reviewCount: { type: Number, default: 0 },

    // Reviews & Installations
    reviews: [TemplateReviewSchema],
    installations: [TemplateInstallationSchema],

    // Publishing
    isPublished: {
      type: Boolean,
      default: false,
      index: true
    },
    publishedAt: { type: Date },
    lastUpdatedAt: { type: Date, default: Date.now },

    // Moderation
    isVerified: {
      type: Boolean,
      default: false,
      index: true
    },
    isFeatured: {
      type: Boolean,
      default: false,
      index: true
    },
    verifiedAt: { type: Date },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true,
    collection: 'workflow_templates'
  }
);

// ============================================
// INDEXES
// ============================================

WorkflowTemplateSchema.index({ isPublished: 1, category: 1, averageRating: -1 });
WorkflowTemplateSchema.index({ isPublished: 1, installCount: -1 });
WorkflowTemplateSchema.index({ isPublished: 1, isFeatured: 1, averageRating: -1 });
WorkflowTemplateSchema.index({ tags: 1, isPublished: 1 });
WorkflowTemplateSchema.index({ name: 'text', description: 'text', tags: 'text' });

// ============================================
// METHODS
// ============================================

WorkflowTemplateSchema.methods.addReview = function(
  userId: Types.ObjectId,
  userName: string,
  rating: number,
  comment?: string
) {
  this.reviews.push({
    userId,
    userName,
    rating,
    comment,
    createdAt: new Date()
  });

  // Recalculate average rating
  this.reviewCount = this.reviews.length;
  this.averageRating = this.reviews.reduce((sum: number, r: ITemplateReview) => sum + r.rating, 0) / this.reviewCount;

  return this.save();
};

WorkflowTemplateSchema.methods.recordInstallation = function(
  userId: Types.ObjectId,
  workflowId: Types.ObjectId,
  parameters?: Record<string, unknown>
) {
  this.installations.push({
    userId,
    workflowId,
    installedAt: new Date(),
    parameters
  });

  this.installCount = this.installations.length;

  return this.save();
};

WorkflowTemplateSchema.methods.incrementViewCount = function() {
  this.viewCount += 1;
  return this.save();
};

WorkflowTemplateSchema.methods.incrementFavoriteCount = function() {
  this.favoriteCount += 1;
  return this.save();
};

WorkflowTemplateSchema.methods.decrementFavoriteCount = function() {
  if (this.favoriteCount > 0) {
    this.favoriteCount -= 1;
  }
  return this.save();
};

WorkflowTemplateSchema.methods.publish = function() {
  this.isPublished = true;
  this.publishedAt = new Date();
  this.lastUpdatedAt = new Date();
  return this.save();
};

WorkflowTemplateSchema.methods.unpublish = function() {
  this.isPublished = false;
  return this.save();
};

WorkflowTemplateSchema.methods.verify = function(verifiedBy: Types.ObjectId) {
  this.isVerified = true;
  this.verifiedAt = new Date();
  this.verifiedBy = verifiedBy;
  return this.save();
};

WorkflowTemplateSchema.methods.feature = function() {
  this.isFeatured = true;
  return this.save();
};

WorkflowTemplateSchema.methods.unfeature = function() {
  this.isFeatured = false;
  return this.save();
};

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.WorkflowTemplate) {
    delete mongoose.models.WorkflowTemplate;
  }
}

export const WorkflowTemplate: Model<IWorkflowTemplate> =
  mongoose.models.WorkflowTemplate ||
  mongoose.model<IWorkflowTemplate>('WorkflowTemplate', WorkflowTemplateSchema);

export default WorkflowTemplate;
