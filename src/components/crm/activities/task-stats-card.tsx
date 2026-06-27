'use client';

import { useActivities, ActivityFilters } from '@/hooks/crm/use-activities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Circle, AlertCircle, Calendar, TrendingUp } from 'lucide-react';
import { startOfDay, endOfDay, addDays, isBefore } from 'date-fns';
import { useMemo } from 'react';

interface TaskStatsCardProps {
  filters?: ActivityFilters;
}

export function TaskStatsCard({ filters }: TaskStatsCardProps) {
  // Fetch all tasks for stats calculation
  const { activities, loading } = useActivities({
    ...filters,
    type: 'task',
    limit: 1000, // Get all tasks for accurate stats
    page: 1,
  });

  const stats = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekEnd = endOfDay(addDays(now, 7));

    const totalTasks = activities.length;
    const completedTasks = activities.filter((a) => a.status === 'completed').length;
    const overdueTasks = activities.filter(
      (a) =>
        a.status !== 'completed' &&
        a.dueDate &&
        isBefore(new Date(a.dueDate), now)
    ).length;
    const dueTodayTasks = activities.filter(
      (a) =>
        a.status !== 'completed' &&
        a.dueDate &&
        new Date(a.dueDate) >= todayStart &&
        new Date(a.dueDate) <= todayEnd
    ).length;
    const dueThisWeekTasks = activities.filter(
      (a) =>
        a.status !== 'completed' &&
        a.dueDate &&
        new Date(a.dueDate) >= todayStart &&
        new Date(a.dueDate) <= weekEnd
    ).length;

    const completionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      total: totalTasks,
      completed: completedTasks,
      overdue: overdueTasks,
      dueToday: dueTodayTasks,
      dueThisWeek: dueThisWeekTasks,
      completionRate,
    };
  }, [activities]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {(['total', 'completed', 'overdue', 'dueToday', 'dueThisWeek'] as const).map((key) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="size-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="size-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
          <Circle className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total}</div>
          <p className="text-xs text-muted-foreground">All tasks</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Completed</CardTitle>
          <CheckCircle2 className="size-4 text-green-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          <p className="text-xs text-muted-foreground">
            {stats.completionRate}% completion rate
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Overdue</CardTitle>
          <AlertCircle className="size-4 text-red-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
          <p className="text-xs text-muted-foreground">Past due date</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Due Today</CardTitle>
          <Calendar className="size-4 text-amber-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-600">{stats.dueToday}</div>
          <p className="text-xs text-muted-foreground">Due by end of day</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Due This Week</CardTitle>
          <TrendingUp className="size-4 text-blue-600" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">{stats.dueThisWeek}</div>
          <p className="text-xs text-muted-foreground">Next 7 days</p>
        </CardContent>
      </Card>
    </div>
  );
}
