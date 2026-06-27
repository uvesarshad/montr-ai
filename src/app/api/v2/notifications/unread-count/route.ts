import { NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { notificationRepository } from '@/lib/db/repository/notification.repository';

/**
 * GET /api/v2/notifications/unread-count
 */
export async function GET() {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const count = await notificationRepository.countUnread(session.user.id!);
        return NextResponse.json({ count });
    } catch (error) {
        console.error('Error counting notifications:', error);
        return NextResponse.json({ error: 'Failed to count notifications' }, { status: 500 });
    }
}
