import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { notificationRepository } from '@/lib/db/repository/notification.repository';
import { updatePreferencesSchema } from '@/validations/notification.schema';
import { z } from 'zod';

/**
 * GET /api/v2/notifications/preferences
 */
export async function GET() {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const prefs = await notificationRepository.getPreferences(session.user.id!);
        return NextResponse.json(prefs);
    } catch (error) {
        console.error('Error fetching preferences:', error);
        return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
    }
}

/**
 * PATCH /api/v2/notifications/preferences
 */
export async function PATCH(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const body = await request.json();
        const patch = updatePreferencesSchema.parse(body);
        const prefs = await notificationRepository.updatePreferences(session.user.id!, patch);
        return NextResponse.json(prefs);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
        }
        console.error('Error updating preferences:', error);
        return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
    }
}
