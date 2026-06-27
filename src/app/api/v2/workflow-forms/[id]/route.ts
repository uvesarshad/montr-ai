import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { workflowFormRequestRepository } from '@/lib/db/repository/workflow-form-request.repository';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v2/workflow-forms/[id]
 * Detail of a single form request. Org-scoped; only the assignee or an org
 * admin may view it.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
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
    if (String(form.assigneeId) !== session.user.id && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      form: {
        id: String(form._id),
        title: form.title,
        description: form.description,
        fields: form.fields,
        workflowId: form.workflowId,
        status: form.status,
        values: form.values,
        createdAt: form.createdAt,
        submittedAt: form.submittedAt,
      },
    });
  } catch (error) {
    console.error('[workflow-forms] detail error:', error);
    return NextResponse.json({ error: 'Failed to load form request' }, { status: 500 });
  }
}
