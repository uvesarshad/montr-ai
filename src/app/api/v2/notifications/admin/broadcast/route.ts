// OSS single-tenant override of src/app/api/v2/notifications/admin/broadcast/route.ts — generated CP-2 hand-patch; org-stripped, userId-scoped.
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { broadcast } from '@/lib/notifications/notification-service';
import { notificationRepository } from '@/lib/db/repository/notification.repository';
import { broadcastSchema } from '@/validations/notification.schema';
import { z } from 'zod';

const ROLE_LABELS: Record<string, string> = {
    user: 'Users',
    admin: 'Admins',
    super_admin: 'Super admins',
};

function audienceLabel(audience: z.infer<typeof broadcastSchema>['audience']): string {
    if (audience.type === 'role') return ROLE_LABELS[audience.role] ?? audience.role;
    return 'All users';
}

/**
 * GET /api/v2/notifications/admin/broadcast
 * List recent broadcasts (super-admin only).
 */
export async function GET() {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        if ((session.user as { role?: string }).role !== 'super_admin') {
            return NextResponse.json({ error: 'Forbidden — super admin only' }, { status: 403 });
        }
        const broadcasts = await notificationRepository.listBroadcasts(25);
        return NextResponse.json({ data: broadcasts });
    } catch (error) {
        console.error('Error listing broadcasts:', error);
        return NextResponse.json({ error: 'Failed to list broadcasts' }, { status: 500 });
    }
}

/**
 * POST /api/v2/notifications/admin/broadcast
 * Super-admin marketing / system broadcast. Fan-out on write.
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const role = (session.user as { role?: string }).role;
        if (role !== 'super_admin') {
            return NextResponse.json({ error: 'Forbidden — super admin only' }, { status: 403 });
        }

        const body = await request.json();
        const input = broadcastSchema.parse(body);

        const delivered = await broadcast(
            {
                type: 'marketing.announcement',
                title: input.title,
                body: input.body,
                severity: input.severity,
                actionUrl: input.actionUrl,
                actionLabel: input.actionLabel,
                createdBy: session.user.id!,
            },
            input.audience
        );

        // Audit log row for the admin History view.
        await notificationRepository.logBroadcast({
            title: input.title,
            body: input.body,
            severity: input.severity,
            actionUrl: input.actionUrl,
            actionLabel: input.actionLabel,
            audienceType: input.audience.type,
            audienceTarget:
                input.audience.type === 'role'
                    ? input.audience.role
                    : undefined,
            audienceLabel: audienceLabel(input.audience),
            deliveredCount: delivered,
            createdBy: session.user.id!,
            createdByName: (session.user as { name?: string }).name,
        });

        return NextResponse.json({ delivered });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
        }
        console.error('Error broadcasting notification:', error);
        return NextResponse.json({ error: 'Failed to broadcast' }, { status: 500 });
    }
}
