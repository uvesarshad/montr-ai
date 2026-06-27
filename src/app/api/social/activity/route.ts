import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { activityLogRepository } from '@/lib/db/repository/activity-log.repository';
import { userRepository } from '@/lib/db/repository/user.repository';

/**
 * GET /api/social/activity
 * Fetch activity log for organization or brand
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const user = await userRepository.findById(session.user.id!);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const { searchParams } = new URL(request.url);
        const brandId = searchParams.get('brandId');
        const action = searchParams.get('action');
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const view = searchParams.get('view') || 'org'; // 'org' | 'brand' | 'user'

        let activities;

        // Super admin can see all activity
        if (user.role === 'super_admin' && view === 'all') {
            activities = await activityLogRepository.findRecent(limit);
        }
        // Organization activity (admin only)
        else if (user.id && (user.role === 'admin' || user.role === 'super_admin')) {
            if (brandId) {
                activities = await activityLogRepository.findByBrand(brandId, limit);
            } else {
                const filters = {
                    ...(action && { action: action as import('@/lib/db/models/activity-log.model').ActivityAction }),
                };
                activities = await activityLogRepository.find(filters, limit);
            }
        }
        // User's own activity
        else {
            activities = await activityLogRepository.findByUser(user._id.toString(), limit);
        }

        // Get action counts if org admin
        let actionCounts = null;
        let dailySummary = null;
        if (user.id && (user.role === 'admin' || user.role === 'super_admin')) {
            actionCounts = await activityLogRepository.getActionCounts();
            dailySummary = await activityLogRepository.getDailyActivitySummary(30);
        }

        return NextResponse.json({
            activities,
            actionCounts,
            dailySummary,
        });
    } catch (error) {
        console.error('Error fetching activity:', error);
        return NextResponse.json(
            { error: 'Failed to fetch activity' },
            { status: 500 }
        );
    }
}
