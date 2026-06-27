import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPostApproval extends Document {
    postId: string;                 // Reference to draft or scheduled post
    postType: 'draft' | 'scheduled';
    brandId: string;
    submittedBy: string;            // User ID who submitted
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    reviewedBy?: string;            // Admin user ID who reviewed
    reviewedAt?: Date;
    reviewNote?: string;            // Feedback from reviewer
    comments?: Array<{             // Review thread (submitter + admins)
        userId: string;
        userName?: string;
        text: string;
        createdAt: Date;
    }>;
    createdAt: Date;
    updatedAt: Date;
}

const PostApprovalSchema = new Schema<IPostApproval>(
    {
        postId: {
            type: String,
            required: true,
            index: true,
        },
        postType: {
            type: String,
            enum: ['draft', 'scheduled'],
            required: true,
        },
        brandId: {
            type: String,
            required: true,
            index: true,
        },
        submittedBy: {
            type: String,
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'cancelled'],
            default: 'pending',
            index: true,
        },
        reviewedBy: {
            type: String,
            default: null,
        },
        reviewedAt: {
            type: Date,
            default: null,
        },
        reviewNote: {
            type: String,
            trim: true,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'post_approvals',
    }
);

// Compound indexes for common queries
PostApprovalSchema.index({ status: 1 });
PostApprovalSchema.index({ submittedBy: 1, status: 1 });
PostApprovalSchema.index({ postId: 1, postType: 1 });
PostApprovalSchema.index({ postType: 1, createdAt: -1 }); // Org-scoped approval listing (audit §6)

// Prevent model recompilation in development
const PostApproval: Model<IPostApproval> =
    mongoose.models.PostApproval || mongoose.model<IPostApproval>('PostApproval', PostApprovalSchema);

// Model-evolution guard: add the review-comments thread to an already-registered
// model (e.g. during HMR / when another module compiled the schema first).
if (!PostApproval.schema.path('comments')) {
    PostApproval.schema.add({
        comments: {
            type: [
                new Schema(
                    {
                        userId: { type: String, required: true },
                        userName: { type: String },
                        text: { type: String, required: true },
                        createdAt: { type: Date, default: Date.now },
                    },
                    { _id: false }
                ),
            ],
            default: [],
        },
    });
}

export default PostApproval;
