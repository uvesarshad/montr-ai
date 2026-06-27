import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPostTemplate extends Document {
    brandId: string;
    userId: string;
    deletedAt?: Date | null;      // Soft delete (audit §D)
    name: string;
    description?: string;
    content: string;
    media: {
        url: string;
        type: 'image' | 'video';
        altText?: string;
    }[];
    platforms: string[];          // Default platforms
    category?: string;            // Template category
    tags: string[];               // Searchable tags
    usageCount: number;
    isPublic: boolean;            // Shared with team
    createdAt: Date;
    updatedAt: Date;
}

const PostTemplateSchema = new Schema<IPostTemplate>(
    {
        brandId: {
            type: String,
            required: true,
            index: true,
        },
        userId: {
            type: String,
            required: true,
        },
        deletedAt: {
            type: Date,
            default: null,
            index: true,
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
        content: {
            type: String,
            required: true,
        },
        media: [{
            url: { type: String, required: true },
            type: { type: String, enum: ['image', 'video'], required: true },
            altText: { type: String },
        }],
        platforms: {
            type: [String],
            default: [],
        },
        category: {
            type: String,
            trim: true,
        },
        tags: {
            type: [String],
            default: [],
            index: true,
        },
        usageCount: {
            type: Number,
            default: 0,
        },
        isPublic: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        collection: 'post_templates',
    }
);

// Indexes
PostTemplateSchema.index({ brandId: 1, category: 1 });
PostTemplateSchema.index({ brandId: 1, isPublic: 1 });
PostTemplateSchema.index({ name: 'text', tags: 'text' });

const PostTemplate: Model<IPostTemplate> =
    mongoose.models.PostTemplate || mongoose.model<IPostTemplate>('PostTemplate', PostTemplateSchema);

export default PostTemplate;
