
import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IMarketingTemplate extends Document {
    name: string;
    subject?: string;
    previewText?: string;

    htmlContent: string;
    textContent?: string;
    jsonContent?: Record<string, unknown>; // For visual builder state (e.g. Email Editor JSON)

    // AI Generation
    isAIGenerated: boolean;
    aiPrompt?: string;
    aiModel?: string;

    // Variables
    variables: string[];

    // Metadata
    category?: string;
    tags: string[];
    isPublic: boolean;

    createdById: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const MarketingTemplateSchema = new Schema<IMarketingTemplate>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        subject: String,
        previewText: String,
        htmlContent: {
            type: String,
            required: true,
        },
        textContent: String,
        jsonContent: Schema.Types.Mixed,
        isAIGenerated: {
            type: Boolean,
            default: false,
        },
        aiPrompt: String,
        aiModel: String,
        variables: {
            type: [String],
            default: [],
        },
        category: String,
        tags: {
            type: [String],
            default: [],
        },
        isPublic: {
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
        collection: 'marketing_templates',
    }
);

// Indexes
MarketingTemplateSchema.index({ name: 1 });
MarketingTemplateSchema.index({ tags: 1 });

const MarketingTemplate: Model<IMarketingTemplate> =
    mongoose.models.MarketingTemplate || mongoose.model<IMarketingTemplate>('MarketingTemplate', MarketingTemplateSchema);

export default MarketingTemplate;
