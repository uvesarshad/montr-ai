import { NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { getPendingActions, approveAction, rejectAction } from '@/lib/agent/hitl-gateway';

/**
 * GET /api/v2/agent-actions
 * List pending agent actions for the current user.
 */
export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const missionId = searchParams.get('missionId') || undefined;
        const actions = await getPendingActions(session.user.id!, missionId);
        return NextResponse.json(actions);
    } catch (error) {
        console.error('Error fetching pending actions:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

/**
 * POST /api/v2/agent-actions
 * Approve or reject a pending action.
 * Body: { actionId: string, decision: 'approve' | 'reject', reason?: string }
 */
export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const { actionId, decision, reason } = await req.json();

        if (!actionId || !decision) {
            return new NextResponse('actionId and decision are required', { status: 400 });
        }

        const userId = session.user.id!;
        const scope = { userId };

        let action;
        if (decision === 'approve') {
            action = await approveAction(actionId, userId, scope);
        } else if (decision === 'reject') {
            action = await rejectAction(actionId, userId, reason, scope);
        } else {
            return new NextResponse('decision must be "approve" or "reject"', { status: 400 });
        }

        if (!action) {
            return new NextResponse('Action not found', { status: 404 });
        }

        return NextResponse.json(action);
    } catch (error) {
        console.error('Error resolving agent action:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
