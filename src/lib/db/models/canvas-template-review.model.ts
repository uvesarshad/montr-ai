import { Schema, model, models, Document, Types } from 'mongoose';

export interface ICanvasTemplateReview extends Document {
    templateId: Types.ObjectId;
    userId: Types.ObjectId;
    userName: string;
    rating: number;
    comment?: string;
    helpfulCount: number;
    createdAt: Date;
    updatedAt: Date;
}

const CanvasTemplateReviewSchema = new Schema<ICanvasTemplateReview>(
    {
        templateId: { type: Schema.Types.ObjectId, ref: 'CanvasTemplate', required: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        userName: { type: String, required: true },
        rating: { type: Number, required: true, min: 1, max: 5 },
        comment: { type: String, maxlength: 500, trim: true },
        helpfulCount: { type: Number, default: 0 },
    },
    {
        timestamps: true,
        collection: 'canvas_template_reviews',
    }
);

CanvasTemplateReviewSchema.index({ templateId: 1, userId: 1 }, { unique: true });
CanvasTemplateReviewSchema.index({ templateId: 1, rating: -1 });
CanvasTemplateReviewSchema.index({ templateId: 1, createdAt: -1 });

export const CanvasTemplateReview =
    models.CanvasTemplateReview ||
    model<ICanvasTemplateReview>('CanvasTemplateReview', CanvasTemplateReviewSchema);

export default CanvasTemplateReview;
