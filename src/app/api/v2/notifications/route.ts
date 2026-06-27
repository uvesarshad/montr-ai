import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { notificationRepository } from '@/lib/db/repository/notification.repository';
import { listNotificationsQuerySchema } from '@/validations/notification.schema';

/**
 * GET /api/v2/notifications
 * List the current user's notifications (paginated, filterable).
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id!;

        const { searchParams } = new URL(request.url);
        const parsed = listNotificationsQuerySchema.safeParse({
            category: searchParams.get('category') ?? undefined,
            read: searchParams.get('read') ?? undefined,
            archived: searchParams.get('archived') ?? undefined,
            page: searchParams.get('page') ?? undefined,
            limit: searchParams.get('limit') ?? undefined,
        });
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid query', details: parsed.error.errors }, { status: 400 });
        }

        const result = await notificationRepository.findForUser(userId, parsed.data);
        return NextResponse.json(result);
    } catch (error) {
        console.error('Error listing notifications:', error);
        return NextResponse.json(
            { error: 'Failed to list notifications', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
