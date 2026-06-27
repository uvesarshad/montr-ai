import { Schema, model, models, Document, Types } from 'mongoose';

// Template categories
export const TEMPLATE_CATEGORIES = [
    'marketing',
    'sales',
    'customer-support',
    'social-media',
    'automation',
    'ai-assistants',
    'data-processing',
    'notifications',
    'integrations',
    'other',
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

// Template difficulty levels
export const TEMPLATE_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export type TemplateDifficulty = (typeof TEMPLATE_DIFFICULTIES)[number];

// Template status
export const TEMPLATE_STATUSES = ['draft', 'pending', 'published', 'rejected', 'archived'] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export interface ICanvasTemplate extends Document {
    // Basic info
    name: string;
    description: string;
    longDescription?: string;
    category: TemplateCategory;
    difficulty: TemplateDifficulty;
    tags: string[];
    previewImageUrl?: string;
    screenshots: string[];
    useCases: string[];
    requirements: string[];
    compatibleTriggers: string[];
    version: string;

    // Template content (stored as JSON strings like canvas)
    nodesJson: string;
    edgesJson: string;

    // Author info
    authorId: Types.ObjectId;
    authorName: string;
    // Publishing
    isOfficial: boolean;
    status: TemplateStatus;
    isPublic: boolean;
    isFeatured: boolean;
    publishedAt?: Date;
    rejectionReason?: string;

    // Stats
    usageCount: number;
    rating: number;
    ratingCount: number;
    viewCount: number;

    // Timestamps
    createdAt: Date;
    updatedAt: Date;
}

const CanvasTemplateSchema = new Schema<ICanvasTemplate>(
    {
        name: { type: String, required: true, trim: true, maxlength: 100 },
        description: { type: String, required: true, maxlength: 500 },
        longDescription: { type: String, maxlength: 2000 },
        category: { type: String, required: true, enum: TEMPLATE_CATEGORIES },
        difficulty: { type: String, required: true, enum: TEMPLATE_DIFFICULTIES },
        tags: [{ type: String, trim: true, lowercase: true }],
        previewImageUrl: { type: String },
        screenshots: [{ type: String }],
        useCases: [{ type: String, trim: true, maxlength: 100 }],
        requirements: [{ type: String, trim: true, maxlength: 100 }],
        compatibleTriggers: [{ type: String, trim: true }],
        version: { type: String, default: '1.0.0' },

        nodesJson: { type: String, required: true },
        edgesJson: { type: String, required: true },

        authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        authorName: { type: String, required: true },

        isOfficial: { type: Boolean, default: false },
        status: { type: String, enum: TEMPLATE_STATUSES, default: 'draft' },
        isPublic: { type: Boolean, default: false },
        isFeatured: { type: Boolean, default: false },
        publishedAt: { type: Date },
        rejectionReason: { type: String, maxlength: 500 },

        usageCount: { type: Number, default: 0 },
        rating: { type: Number, default: 0, min: 0, max: 5 },
        ratingCount: { type: Number, default: 0 },
        viewCount: { type: Number, default: 0 },
    },
    {
        timestamps: true,
        collection: 'canvas_templates',
    }
);

// Indexes for efficient queries
CanvasTemplateSchema.index({ status: 1, isPublic: 1 });
CanvasTemplateSchema.index({ category: 1, status: 1 });
CanvasTemplateSchema.index({ authorId: 1 });
CanvasTemplateSchema.index({ tags: 1 });
CanvasTemplateSchema.index({ isFeatured: 1, status: 1 });
CanvasTemplateSchema.index({ isOfficial: 1, status: 1 });
CanvasTemplateSchema.index({ usageCount: -1 });
CanvasTemplateSchema.index({ rating: -1 });
CanvasTemplateSchema.index({ createdAt: -1 });
CanvasTemplateSchema.index(
    { name: 'text', description: 'text', tags: 'text', longDescription: 'text' },
    { weights: { name: 10, tags: 5, description: 2, longDescription: 1 } }
);

export const CanvasTemplate =
    models.CanvasTemplate || model<ICanvasTemplate>('CanvasTemplate', CanvasTemplateSchema);

export default CanvasTemplate;
