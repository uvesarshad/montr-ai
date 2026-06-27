import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { activityRepository } from '@/lib/db/repository/crm/activity.repository';
import type { ICrmActivity } from '@/lib/db/models/crm/activity.model';

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    const ctx = await getCrmPermissionContext(userId);
    assertCrmPermission(ctx, 'contact', 'read');
    // Calculate date ranges
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get all activities
    const allActivities = await activityRepository.find({}, { limit: 10000 });

    // Calculate stats
    const byType: Record<string, number> = {};
    const completedThisWeek: ICrmActivity[] = [];
    const completedThisMonth: ICrmActivity[] = [];
    const upcoming: ICrmActivity[] = [];
    const overdue: ICrmActivity[] = [];

    allActivities.data.forEach(activity => {
      // Count by type
      byType[activity.type] = (byType[activity.type] || 0) + 1;

      // Tasks statistics
      if (activity.type === 'task') {
        if (activity.completed && activity.completedAt) {
          const completedDate = new Date(activity.completedAt);
          if (completedDate >= startOfWeek) {
            completedThisWeek.push(activity);
          }
          if (completedDate >= startOfMonth) {
            completedThisMonth.push(activity);
          }
        } else if (!activity.completed) {
          if (activity.dueDate) {
            const dueDate = new Date(activity.dueDate);
            if (dueDate < now) {
              overdue.push(activity);
            } else if (dueDate <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) {
              // Due within next 7 days
              upcoming.push(activity);
            }
          }
        }
      }

      // Upcoming meetings and calls
      if ((activity.type === 'meeting' || activity.type === 'call') && activity.startTime) {
        const startTime = new Date(activity.startTime);
        if (startTime > now && startTime <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) {
          upcoming.push(activity);
        }
      }
    });

    // Calculate completion rate for this week
    const tasksThisWeek = allActivities.data.filter(a =>
      a.type === 'task' &&
      a.createdAt >= startOfWeek
    );
    const completionRate = tasksThisWeek.length > 0
      ? (completedThisWeek.length / tasksThisWeek.length) * 100
      : 0;

    // Get activity timeline data (last 30 days)
    const last30Days = new Date(now);
    last30Days.setDate(now.getDate() - 30);

    const timelineData: Record<string, { date: string; count: number; completed: number }> = {};
    const activitiesLast30Days = allActivities.data.filter(a => new Date(a.createdAt) >= last30Days);

    activitiesLast30Days.forEach(activity => {
      const dateKey = new Date(activity.createdAt).toISOString().split('T')[0];
      if (!timelineData[dateKey]) {
        timelineData[dateKey] = { date: dateKey, count: 0, completed: 0 };
      }
      timelineData[dateKey].count++;
      if (activity.completed) {
        timelineData[dateKey].completed++;
      }
    });

    const timeline = Object.values(timelineData).sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const response = {
      total: allActivities.pagination.total,
      byType,
      tasks: {
        completedThisWeek: completedThisWeek.length,
        completedThisMonth: completedThisMonth.length,
        upcoming: upcoming.length,
        overdue: overdue.length,
        completionRate,
      },
      upcomingActivities: upcoming.slice(0, 10).map(a => ({
        _id: a._id,
        type: a.type,
        title: a.subject,
        dueDate: a.dueDate,
        startDate: a.startTime,
      })),
      overdueActivities: overdue.slice(0, 10).map(a => ({
        _id: a._id,
        type: a.type,
        title: a.subject,
        dueDate: a.dueDate,
      })),
      timeline,
    };

    return NextResponse.json(response);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching activity stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity stats' },
      { status: 500 }
    );
  }
}
