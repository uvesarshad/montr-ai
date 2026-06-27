'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ActivityTypeIcon } from '@/components/crm/activities/activity-type-icon';
import { Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Activity } from '@/types/crm';

interface RecentActivityListProps {
  activities: Activity[];
  loading?: boolean;
}

function getActivityLink(activity: Activity): string {
  // Link to the related entity
  if (activity.contactId) {
    return `/crm/contacts/${activity.contactId}`;
  } else if (activity.companyId) {
    return `/crm/companies/${activity.companyId}`;
  } else if (activity.dealId) {
    return `/crm/deals/${activity.dealId}`;
  }
  return '/crm/activities';
}

function getActivityDescription(activity: Activity): string {
  const type = activity.type;
  const status = activity.status;

  if (type === 'task') {
    if (status === 'completed') {
      return 'Task completed';
    } else if (activity.dueDate && new Date(activity.dueDate) < new Date()) {
      return 'Task overdue';
    }
    return 'Task created';
  }

  if (type === 'note') {
    return 'Note added';
  }

  if (type === 'call') {
    return status === 'completed' ? 'Call completed' : 'Call scheduled';
  }

  if (type === 'meeting') {
    return status === 'completed' ? 'Meeting completed' : 'Meeting scheduled';
  }

  if (type === 'email') {
    return 'Email sent';
  }

  if (type === 'message') {
    return 'Message sent';
  }

  return 'Activity';
}

export function RecentActivityList({ activities, loading = false }: RecentActivityListProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="size-5 text-muted-foreground" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="size-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="size-5 text-muted-foreground" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">No recent activity</p>
            <p className="text-xs text-muted-foreground mt-1">
              Start adding activities to see them here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="size-5 text-muted-foreground" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {activities.map((activity) => (
          <Link
            key={activity._id}
            href={getActivityLink(activity)}
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg transition-colors',
              'hover:bg-muted/50'
            )}
          >
            {/* Icon */}
            <div className="flex-shrink-0 mt-0.5">
              <div className="p-2 rounded-full bg-muted">
                <ActivityTypeIcon type={activity.type} className="size-4" />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {activity.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {getActivityDescription(activity)}
                  </p>
                </div>
              </div>

              {/* Timestamp */}
              <p className="text-xs text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
              </p>
            </div>
          </Link>
        ))}

        {activities.length > 0 && (
          <div className="pt-2">
            <Link
              href="/crm/activities"
              className="text-xs text-primary hover:underline block text-center"
            >
              View all activities →
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
