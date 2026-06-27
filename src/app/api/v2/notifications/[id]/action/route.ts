import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { notificationRepository } from '@/lib/db/repository/notification.repository';
import { notificationActionSchema } from '@/validations/notification.schema';
import { z } from 'zod';

/**
 * POST /api/v2/notifications/[id]/action
 * Act on an actionable notification (e.g. approve/reject an approval request).
 * For approval notifications this calls back into the approval queue so the
 * underlying entity is actually decided.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id!;

        const body = await request.json();
        const { decision, note } = notificationActionSchema.parse(body);

        const notification = await notificationRepository.findById(params.id, userId);
        if (!notification) {
            return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
        }
        if (!notification.requiresAction) {
            return NextResponse.json({ error: 'Notification is not actionable' }, { status: 400 });
        }
        if (notification.actionStatus && notification.actionStatus !== 'pending') {
            return NextResponse.json({ error: 'Already resolved', actionStatus: notification.actionStatus }, { status: 409 });
        }

        // Drive the underlying approval decision when present.
        const approvalId = (notification.data as Record<string, unknown> | undefined)?.approvalId as string | undefined;
        if (notification.category === 'approval' && approvalId) {
            const { decideApproval } = await import('@/lib/approvals');
            await decideApproval({ approvalId, decision, reviewedBy: userId, reviewNote: note });
        }

        const updated = await notificationRepository.setActionStatus(params.id, userId, decision);
        return NextResponse.json(updated);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
        }
        console.error('Error acting on notification:', error);
        return NextResponse.json({ error: 'Failed to act on notification' }, { status: 500 });
    }
}
