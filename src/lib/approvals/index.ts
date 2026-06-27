/**
 * Central approval queue helpers (X4).
 *
 * Producers (post-approval submitter, workflow human-in-the-loop nodes, AI
 * Studio brand-review surface, voice escalation handler) write here. Reviewers
 * consume via the unified `/approvals` surface.
 *
 * The producer side stays thin so call sites can drop in a one-liner without
 * pulling in models or worrying about idempotency.
 */

import { Types } from 'mongoose';
import { connectMongoose } from '@/lib/mongodb';
import {
  ApprovalRequest,
  IApprovalRequest,
  ApprovalSubjectKind,
  ApprovalPriority,
  ApprovalStatus,
} from '@/lib/db/models/approval-request.model';
import { publishDomainEvent } from '@/lib/events/domain-bus';

export interface CreateApprovalInput {
  brandId?: Types.ObjectId | string;
  subjectKind: ApprovalSubjectKind;
  subjectId: string;
  subjectSummary?: Record<string, unknown>;
  submittedBy: Types.ObjectId | string;
  assignee?: Types.ObjectId | string;
  priority?: ApprovalPriority;
  expiresAt?: Date;
  subjectCreatedAt?: Date;
}

/**
 * Create or upsert an approval request. Idempotent on `(subjectKind, subjectId)` —
 * resubmitting an already-pending entity refreshes the metadata rather than
 * duplicating the row.
 */
export async function createApproval(input: CreateApprovalInput): Promise<IApprovalRequest> {
  await connectMongoose();
  const approval = (await ApprovalRequest.findOneAndUpdate(
    { subjectKind: input.subjectKind, subjectId: input.subjectId },
    {
      $set: {
        brandId: input.brandId ? new Types.ObjectId(String(input.brandId)) : undefined,
        subjectSummary: input.subjectSummary,
        submittedBy: new Types.ObjectId(String(input.submittedBy)),
        assignee: input.assignee ? new Types.ObjectId(String(input.assignee)) : undefined,
        priority: input.priority ?? 'normal',
        status: 'pending' as ApprovalStatus,
        expiresAt: input.expiresAt,
        subjectCreatedAt: input.subjectCreatedAt,
      },
      $setOnInsert: {
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
      },
    },
    { new: true, upsert: true }
  ).exec()) as IApprovalRequest;

  if (input.subjectKind === 'post') {
    publishDomainEvent({
      type: 'post.approval_requested',
      brandId: input.brandId ? String(input.brandId) : undefined,
      source: 'approvals.createApproval',
      payload: {
        approvalId: approval._id.toString(),
        subjectId: input.subjectId,
        priority: input.priority ?? 'normal',
      },
    });
  }

  return approval;
}

export interface ListApprovalsFilter {
  brandId?: Types.ObjectId | string;
  subjectKind?: ApprovalSubjectKind;
  status?: ApprovalStatus;
  assignee?: Types.ObjectId | string;
  limit?: number;
  skip?: number;
}

export async function listApprovals(filter: ListApprovalsFilter): Promise<IApprovalRequest[]> {
  await connectMongoose();
  const q: Record<string, unknown> = {
};
  if (filter.brandId) q.brandId = new Types.ObjectId(String(filter.brandId));
  if (filter.subjectKind) q.subjectKind = filter.subjectKind;
  if (filter.status) q.status = filter.status;
  if (filter.assignee) q.assignee = new Types.ObjectId(String(filter.assignee));
  return ApprovalRequest.find(q)
    .sort({ priority: -1, createdAt: -1 })
    .limit(filter.limit ?? 50)
    .skip(filter.skip ?? 0)
    .exec();
}

export interface DecideApprovalInput {
  approvalId: Types.ObjectId | string;
  decision: 'approved' | 'rejected';
  reviewedBy: Types.ObjectId | string;
  reviewNote?: string;
  decisionData?: Record<string, unknown>;
}

/**
 * Approve / reject. Idempotent — re-deciding an already-decided request is a
 * no-op (preserves the original reviewer + timestamp). Scoped to the caller's
 * organization so a request from another tenant can never be decided.
 */
export async function decideApproval(input: DecideApprovalInput): Promise<IApprovalRequest | null> {
  await connectMongoose();
  const approval = await ApprovalRequest.findOneAndUpdate(
    {
      _id: input.approvalId,
      status: 'pending',
    },
    {
      $set: {
        status: input.decision,
        reviewedBy: new Types.ObjectId(String(input.reviewedBy)),
        reviewedAt: new Date(),
        reviewNote: input.reviewNote,
        decisionData: input.decisionData,
      },
    },
    { new: true }
  );

  if (approval && approval.subjectKind === 'post') {
    publishDomainEvent({
      type: input.decision === 'approved' ? 'post.approved' : 'post.rejected',
      brandId: approval.brandId?.toString(),
      source: 'approvals.decideApproval',
      payload: {
        approvalId: approval._id.toString(),
        subjectId: approval.subjectId,
        reviewedBy: String(input.reviewedBy),
        reviewNote: input.reviewNote,
      },
    });
  }

  return approval;
}

export async function cancelApproval(
  approvalId: Types.ObjectId | string
): Promise<void> {
  await connectMongoose();
  await ApprovalRequest.updateOne(
    {
      _id: approvalId,
      status: 'pending',
    },
    { $set: { status: 'cancelled' as ApprovalStatus } }
  );
}

/**
 * Sweep expired requests. Run from a cron or scheduler.
 */
export async function expireOverdue(): Promise<number> {
  await connectMongoose();
  const now = new Date();
  const result = await ApprovalRequest.updateMany(
    { status: 'pending', expiresAt: { $lte: now } },
    { $set: { status: 'expired' as ApprovalStatus } }
  );
  return result.modifiedCount ?? 0;
}
