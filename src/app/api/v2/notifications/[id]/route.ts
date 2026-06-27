import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { notificationRepository } from '@/lib/db/repository/notification.repository';
import { patchNotificationSchema } from '@/validations/notification.schema';
import { z } from 'zod';

/**
 * PATCH /api/v2/notifications/[id]
 * Mark a single notification read and/or archived.
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id!;

        const body = await request.json();
        const { read, archived } = patchNotificationSchema.parse(body);

        let updated = null;
        if (archived) {
            updated = await notificationRepository.archive(params.id, userId);
        } else if (read) {
            updated = await notificationRepository.markRead(params.id, userId);
        }

        if (!updated) {
            return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
        }
        return NextResponse.json(updated);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
        }
        console.error('Error updating notification:', error);
        return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
    }
}

/**
 * DELETE /api/v2/notifications/[id]
 * Dismiss (delete) a notification.
 */
export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const ok = await notificationRepository.remove(params.id, session.user.id!);
        if (!ok) {
            return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting notification:', error);
        return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 });
    }
}
