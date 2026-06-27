import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { workflowFormRequestRepository } from '@/lib/db/repository/workflow-form-request.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v2/workflow-forms/[id]/cancel
 * Cancel a pending form request. The assignee, the workflow owner, or an org
 * admin may cancel.
 */
export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await userRepository.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const { id } = await ctx.params;

    const form = await workflowFormRequestRepository.findById(id);
    if (!form) {
      return NextResponse.json({ error: 'Form request not found' }, { status: 404 });
    }

    const role = (session.user as { role?: string }).role;
    const isAdmin = role === 'admin' || role === 'super_admin';
    let isOwner = false;
    if (!isAdmin && String(form.assigneeId) !== session.user.id) {
      // Fall back to a workflow-owner check.
      try {
        const { UnifiedWorkflow } = await import('@/lib/db/models/unified-workflow.model');
        const wf = await UnifiedWorkflow.findOne({ _id: form.workflowId })
          .select('createdById')
          .lean();
        isOwner = !!wf && String((wf as { createdById?: unknown }).createdById) === session.user.id;
      } catch {
        /* ignore — treated as not-owner */
      }
    }
    if (String(form.assigneeId) !== session.user.id && !isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updated = await workflowFormRequestRepository.cancel(id);
    if (!updated) {
      return NextResponse.json({ error: `Form is already ${form.status}` }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[workflow-forms] cancel error:', error);
    return NextResponse.json({ error: 'Failed to cancel form' }, { status: 500 });
  }
}
