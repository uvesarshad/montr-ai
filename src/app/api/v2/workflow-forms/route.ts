import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { workflowFormRequestRepository } from '@/lib/db/repository/workflow-form-request.repository';

/**
 * GET /api/v2/workflow-forms
 * Pending interactive form requests assigned to the session user (org-scoped).
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = await userRepository.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const requests = await workflowFormRequestRepository.listPending(session.user.id);

    return NextResponse.json({
      forms: requests.map((r) => ({
        id: String(r._id),
        title: r.title,
        description: r.description,
        fields: r.fields,
        workflowId: r.workflowId,
        status: r.status,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('[workflow-forms] list error:', error);
    return NextResponse.json({ error: 'Failed to list form requests' }, { status: 500 });
  }
}
