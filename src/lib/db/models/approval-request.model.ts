/**
 * ApprovalRequest — central approval queue (X4).
 *
 * One inbox for every pending decision in the platform:
 *   - Post approvals (social posts awaiting reviewer sign-off)
 *   - Workflow pending actions ("human in the loop" nodes)
 *   - AI Studio outputs awaiting brand review before publish
 *   - Voice / inbox escalations (Bundle 3 contributes these)
 *
 * Polymorphic by `subjectKind` + `subjectId`. The original entity table stays
 * authoritative for its own state; this queue is the unified review surface
 * + audit log.
 *
 * Agency mode: every request carries `brandId` AND `organizationId`. The
 * `assignee` is optional — when unset the request is org-wide and any
 * reviewer can claim it.
 */

import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type ApprovalSubjectKind =
  | 'post'                  // social post awaiting publish approval
  | 'campaign'              // marketing email campaign
  | 'workflow-action'       // workflow pending a human-in-the-loop action
  | 'ai-studio-output'      // generated asset awaiting brand review
  | 'inbox-escalation'      // inbox conversation escalated to a manager
  | 'voice-call'            // voice call outcome flagged for review (B3)
  | 'whatsapp-template'     // WhatsApp template awaiting Meta-approval gate (B3-5.2)
  | 'voice-script';         // voice campaign script awaiting review (B3-5.2)

export type ApprovalPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';

export interface IApprovalRequest extends Document {
  brandId?: Types.ObjectId;

  subjectKind: ApprovalSubjectKind;
  /** ID of the underlying entity (post / workflow execution / session / etc). */
  subjectId: string;
  /** Free-form metadata for the reviewer UI (post title, prompt, etc). */
  subjectSummary?: Record<string, unknown>;

  submittedBy: Types.ObjectId;
  /** Optional — when set, only this user (or admins) can review. */
  assignee?: Types.ObjectId;

  priority: ApprovalPriority;
  status: ApprovalStatus;

  /** Optional auto-expire at this time (workflow actions with a deadline). */
  expiresAt?: Date;

  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  reviewNote?: string;

  /** Free-form decision payload (e.g. user's chosen branch on a workflow gate). */
  decisionData?: Record<string, unknown>;

  /** When the underlying entity was created — useful for SLA tracking. */
  subjectCreatedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const ApprovalRequestSchema = new Schema<IApprovalRequest>({
  brandId: { type: Schema.Types.ObjectId, ref: 'Brand', index: true },

  subjectKind: {
    type: String,
    enum: ['post', 'campaign', 'workflow-action', 'ai-studio-output', 'inbox-escalation', 'voice-call'],
    required: true,
    index: true,
  },
  subjectId: { type: String, required: true, index: true },
  subjectSummary: { type: Schema.Types.Mixed },

  submittedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  assignee: { type: Schema.Types.ObjectId, ref: 'User', index: true },

  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal',
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled', 'expired'],
    default: 'pending',
    index: true,
  },

  expiresAt: { type: Date, index: true },

  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  reviewNote: { type: String, trim: true },
  decisionData: { type: Schema.Types.Mixed },

  subjectCreatedAt: Date,
}, {
  timestamps: true,
  collection: 'approval_requests',
});

ApprovalRequestSchema.index({ status: 1, priority: -1, createdAt: -1 });
ApprovalRequestSchema.index({ brandId: 1, status: 1 });
ApprovalRequestSchema.index({ assignee: 1, status: 1 });
ApprovalRequestSchema.index({ subjectKind: 1, subjectId: 1 }, { unique: true, sparse: true });

if (process.env.NODE_ENV === 'development') {
  if (mongoose.models.ApprovalRequest) {
    delete mongoose.models.ApprovalRequest;
  }
}

export const ApprovalRequest: Model<IApprovalRequest> =
  mongoose.models.ApprovalRequest ||
  mongoose.model<IApprovalRequest>('ApprovalRequest', ApprovalRequestSchema);

export default ApprovalRequest;
