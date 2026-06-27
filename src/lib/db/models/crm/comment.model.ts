import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface ICommentReaction {
  emoji: string;
  userIds: Types.ObjectId[];
}

export interface ICrmComment extends Document {
  // Target
  targetType: 'contact' | 'company' | 'deal' | 'activity';
  targetId: Types.ObjectId;

  // Comment Content
  body: string; // TipTap JSON (rich text with @mentions)
  bodyPlain: string; // Plain text for notifications
  mentions: Types.ObjectId[]; // User IDs mentioned

  // Thread
  parentId?: Types.ObjectId;
  replyCount: number;

  // Reactions
  reactions: ICommentReaction[];

  // Status
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;

  createdById: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CommentReactionSchema = new Schema({
  emoji: {
    type: String,
    required: true,
  },
  userIds: [{
    type: Schema.Types.ObjectId,
    ref: 'User',
  }],
}, { _id: false });

const CrmCommentSchema = new Schema<ICrmComment>(
  {
    targetType: {
      type: String,
      enum: ['contact', 'company', 'deal', 'activity'],
      required: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    bodyPlain: {
      type: String,
      required: true,
    },
    mentions: [{
      type: Schema.Types.ObjectId,
      ref: 'User',
    }],
    parentId: {
      type: Schema.Types.ObjectId,
      ref: 'CrmComment',
    },
    replyCount: {
      type: Number,
      default: 0,
    },
    reactions: {
      type: [CommentReactionSchema],
      default: [],
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: Date,
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
    createdById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'crm_comments',
  }
);

// Indexes
CrmCommentSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
CrmCommentSchema.index({ mentions: 1, createdAt: -1 });
CrmCommentSchema.index({ parentId: 1 });

// Prevent model recompilation in development
if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.CrmComment) {
    delete mongoose.models.CrmComment;
  }
}

const CrmComment: Model<ICrmComment> =
  mongoose.models.CrmComment || mongoose.model<ICrmComment>('CrmComment', CrmCommentSchema);

export default CrmComment;
