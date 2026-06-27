/**
 * POST /api/v2/approvals/[id] — decide on a pending approval request.
 *
 * Body: `{ decision: 'approved' | 'rejected', reviewNote?: string, decisionData?: object }`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { decideApproval, cancelApproval } from '@/lib/approvals';

interface DecideBody {
  decision: 'approved' | 'rejected';
  reviewNote?: string;
  decisionData?: Record<string, unknown>;
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await request.json()) as DecideBody;
  if (body.decision !== 'approved' && body.decision !== 'rejected') {
    return NextResponse.json({ error: 'decision must be "approved" or "rejected"' }, { status: 400 });
  }
  try {
    const result = await decideApproval({
      approvalId: id,
      decision: body.decision,
      reviewedBy: session.user.id,
      reviewNote: body.reviewNote,
      decisionData: body.decisionData,
    });
    if (!result) {
      return NextResponse.json({ error: 'Approval not found or already decided' }, { status: 404 });
    }
    return NextResponse.json({ approval: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await cancelApproval(id);
  return NextResponse.json({ success: true });
}
