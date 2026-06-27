'use client';

import { useState } from 'react';
import { Activity } from '@/types/crm';
import { ActivityItem } from './activity-item';
import { ActivityForm } from './activity-form';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Filter } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useActivities } from '@/hooks/crm/use-activities';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';

interface ActivityTimelineProps {
  targetType: 'contact' | 'company' | 'deal';
  targetId: string;
}

export function ActivityTimeline({ targetType, targetId }: ActivityTimelineProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [_editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const { toast } = useToast();

  const { activities, loading, refetch } = useActivities({
    targetType,
    targetId,
    type: typeFilter === 'all' ? undefined : typeFilter,
    sort: '-createdAt',
    limit: 50,
  });

  const handleDelete = async (activity: Activity) => {
    if (!confirm('Are you sure you want to delete this activity?')) return;

    try {
      const response = await fetch(`/api/v2/crm/activities/${activity._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete activity');
      }

      toast({
        title: 'Success',
        description: 'Activity deleted successfully',
      });

      refetch();
    } catch (error) {
      console.error('Error deleting activity:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to delete activity',
      });
    }
  };

  const handleToggleComplete = async (activity: Activity) => {
    try {
      const response = await fetch(`/api/v2/crm/activities/${activity._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: activity.status === 'completed' ? 'pending' : 'completed',
          completedAt: activity.status === 'completed' ? undefined : new Date(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update activity');
      }

      refetch();
    } catch (error) {
      console.error('Error updating activity:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update activity',
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Activities</SelectItem>
              <SelectItem value="note">Notes</SelectItem>
              <SelectItem value="task">Tasks</SelectItem>
              <SelectItem value="call">Calls</SelectItem>
              <SelectItem value="meeting">Meetings</SelectItem>
              <SelectItem value="email">Emails</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={() => setIsFormOpen(!isFormOpen)} size="sm">
          <Plus className="size-4 mr-2" />
          New Activity
        </Button>
      </div>

      {isFormOpen && (
        <Card className="p-4">
          <ActivityForm
            targetType={targetType}
            targetId={targetId}
            onSuccess={() => {
              setIsFormOpen(false);
              refetch();
            }}
            onCancel={() => setIsFormOpen(false)}
          />
        </Card>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-10 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">No activities yet</p>
            <Button
              variant="link"
              onClick={() => setIsFormOpen(true)}
              className="mt-2"
            >
              Create your first activity
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {activities.map((activity, index) => (
              <div key={activity._id}>
                <ActivityItem
                  activity={activity}
                  onEdit={setEditingActivity}
                  onDelete={handleDelete}
                  onToggleComplete={handleToggleComplete}
                />
                {index < activities.length - 1 && <Separator className="mt-6" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
