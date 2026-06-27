import { NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { notificationRepository } from '@/lib/db/repository/notification.repository';

/**
 * POST /api/v2/notifications/read-all
 * Mark all of the current user's notifications as read.
 */
export async function POST() {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const modified = await notificationRepository.markAllRead(session.user.id!);
        return NextResponse.json({ modified });
    } catch (error) {
        console.error('Error marking notifications read:', error);
        return NextResponse.json({ error: 'Failed to mark notifications read' }, { status: 500 });
    }
}
