/**
 * Central approval queue (X4).
 *
 * GET  /api/v2/approvals       — list pending requests for the user's org / brand
 * POST /api/v2/approvals/[id]  — decide (approve/reject) handled by sibling route
 *
 * Producers (post-approval submission, workflow human-in-the-loop, AI Studio
 * brand review) call `createApproval()` from `@/lib/approvals` directly —
 * they don't go through this endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { listApprovals } from '@/lib/approvals';
import type { ApprovalSubjectKind, ApprovalStatus } from '@/lib/db/models/approval-request.model';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const brandId = searchParams.get('brandId') ?? undefined;
  const subjectKind = searchParams.get('subjectKind') as ApprovalSubjectKind | null;
  const status = (searchParams.get('status') ?? 'pending') as ApprovalStatus;
  const limit = Number(searchParams.get('limit') ?? '50');
  const skip = Number(searchParams.get('skip') ?? '0');

  try {
    const approvals = await listApprovals({
      brandId,
      subjectKind: subjectKind ?? undefined,
      status,
      limit,
      skip,
    });
    return NextResponse.json({ approvals });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
