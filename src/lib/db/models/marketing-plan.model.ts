import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IMarketingTask {
    id: string; // unique ID for the task within the plan
    title: string;
    description: string;
    status: 'pending' | 'in_progress' | 'completed';
    type: 'content' | 'strategy' | 'research' | 'outreach' | 'campaign' | 'automation' | 'other';
    dueDate?: Date;
    difficulty: 'easy' | 'medium' | 'hard'; // Gamification element
    xpReward: number; // Gamification element
}

export interface IMarketingPlan extends Document {
    userId: Types.ObjectId;
    brandId: Types.ObjectId;

    // Business Info
    businessName?: string;
    businessType?: string;
    goals: string[];
    targetAudience?: string;

    // Progress & Gamification
    currentLevel: number;
    currentXp: number;

    // The roadmap
    tasks: IMarketingTask[];

    // Chat context/memory for the agent
    onboardingCompleted: boolean;
    chatHistory: Array<{
        role: 'user' | 'assistant';
        content: string;
        timestamp: Date;
    }>;

    createdAt: Date;
    updatedAt: Date;
}

const MarketingTaskSchema = new Schema({
    id: { type: String, required: true },
    title: { type: String, required: true },
    description: String,
    status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed'],
        default: 'pending'
    },
    type: {
        type: String,
        enum: ['content', 'strategy', 'research', 'outreach', 'campaign', 'automation', 'other'],
        default: 'other'
    },
    dueDate: Date,
    difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard'],
        default: 'medium'
    },
    xpReward: { type: Number, default: 10 }
}, { _id: false });

const MarketingPlanSchema = new Schema<IMarketingPlan>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        brandId: { type: Schema.Types.ObjectId, ref: 'Brand', required: true },

        businessName: String,
        businessType: String,
        goals: [String],
        targetAudience: String,

        currentLevel: { type: Number, default: 1 },
        currentXp: { type: Number, default: 0 },

        tasks: [MarketingTaskSchema],

        onboardingCompleted: { type: Boolean, default: false },
        chatHistory: [{
            role: { type: String, enum: ['user', 'assistant'] },
            content: String,
            timestamp: { type: Date, default: Date.now }
        }],
    },
    {
        timestamps: true,
        collection: 'marketing_plans',
    }
);

MarketingPlanSchema.index({ userId: 1, brandId: 1 }, { unique: true });
// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.MarketingPlan) {
        delete mongoose.models.MarketingPlan;
    }
}

const MarketingPlan: Model<IMarketingPlan> =
    mongoose.models.MarketingPlan || mongoose.model<IMarketingPlan>('MarketingPlan', MarketingPlanSchema);

export default MarketingPlan;
