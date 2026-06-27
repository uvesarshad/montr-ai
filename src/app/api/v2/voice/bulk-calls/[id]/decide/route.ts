/**
 * Approve / reject a bulk dialer batch that was created with
 * `requiresApproval: true` (B2-5.2 routing via central approval queue).
 *
 *   POST /api/v2/voice/bulk-calls/[id]/decide
 *   body: { decision: 'approved' | 'rejected', reviewNote? }
 *
 * On `approved`: marks the underlying ApprovalRequest approved and flips the
 * batch from `pending_approval` → `pending`, then kicks off
 * `scheduleBulkDispatch`. On `rejected`: marks both approval and batch
 * rejected; the batch never runs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Types } from 'mongoose';

import { requireOrgUser } from '@/lib/voice/api-helpers';
import VoiceBulkBatch from '@/lib/db/models/voice/voice-bulk-batch.model';
import { decideApproval } from '@/lib/approvals';
import { scheduleBulkDispatch } from '@/lib/voice/bulk-dispatcher';
import { enqueueCampaign } from '@/lib/voice/campaign';

const schema = z.object({
  decision: z.enum(['approved', 'rejected']),
  reviewNote: z.string().max(2000).optional(),
});

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = await requireOrgUser();
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await request.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: err.errors },
        { status: 400 },
      );
    }
    throw err;
  }

  const batch = await VoiceBulkBatch.findOne({
    _id: id
  }).exec();
  if (!batch) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (batch.status !== 'pending_approval') {
    return NextResponse.json(
      { error: `Batch is in ${batch.status} state — only pending_approval can be decided` },
      { status: 409 },
    );
  }
  if (!batch.approvalId) {
    return NextResponse.json(
      { error: 'Batch has no linked approval request' },
      { status: 409 },
    );
  }

  await decideApproval({
    approvalId: batch.approvalId,
    decision: input.decision,
    reviewedBy: auth.userId,
    reviewNote: input.reviewNote,
  });

  const nextStatus = input.decision === 'approved' ? 'pending' : 'rejected';
  await VoiceBulkBatch.updateOne(
    { _id: batch._id },
    { $set: { status: nextStatus } },
  );

  if (input.decision === 'approved') {
    const batchId = batch._id?.toString() ?? '';
    const enqueued = await enqueueCampaign(batchId, auth.userId);
    if (!enqueued) {
      scheduleBulkDispatch(batchId);
    }
  }

  return NextResponse.json({ ok: true, status: nextStatus });
}
