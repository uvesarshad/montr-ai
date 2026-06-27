'use client';

/**
 * ActivityCalendarView — month calendar of activities/tasks plotted by dueDate.
 * Fetches the visible month's range (org-scoped via the activities API) and
 * renders each activity as a chip. Clicking a chip opens a small Popover with
 * the title/type, a "Complete" action (existing PATCH endpoint), and a link to
 * the related record when the activity targets one.
 */

import * as React from 'react';
import Link from 'next/link';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  format,
} from 'date-fns';
import { Check, ExternalLink } from 'lucide-react';

import {
  useActivities,
  type ActivityFilters,
} from '@/hooks/crm/use-activities';
import {
  RecordCalendar,
  type CalendarItem,
} from '@/components/crm/shared/record-calendar';
import { Button } from '@/components/ui-kit';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { Activity } from '@/types/crm';

interface ActivityCalendarViewProps {
  /** Base filters (search/type/status) to combine with the month range. */
  filters?: Pick<ActivityFilters, 'search' | 'type' | 'status' | 'ownerId'>;
}

const TARGET_PATH: Record<string, string> = {
  contact: 'contacts',
  company: 'companies',
  deal: 'deals',
};

function relatedHref(a: Activity): string | null {
  const path = a.targetType ? TARGET_PATH[a.targetType] : undefined;
  if (path && a.targetId) return `/crm/${path}/${a.targetId}`;
  if (a.dealId) return `/crm/deals/${a.dealId}`;
  if (a.companyId) return `/crm/companies/${a.companyId}`;
  if (a.contactId) return `/crm/contacts/${a.contactId}`;
  return null;
}

const STATUS_CHIP: Record<string, string> = {
  completed:
    'bg-emerald-100 text-emerald-700 border-transparent line-through dark:bg-emerald-500/15 dark:text-emerald-300',
};

export function ActivityCalendarView({ filters }: ActivityCalendarViewProps) {
  const { toast } = useToast();
  const [month, setMonth] = React.useState(() => new Date());

  const range = React.useMemo(() => {
    const ms = startOfMonth(month);
    return {
      after: startOfWeek(ms, { weekStartsOn: 0 }),
      before: endOfWeek(endOfMonth(ms), { weekStartsOn: 0 }),
    };
  }, [month]);

  const activityFilters = React.useMemo<ActivityFilters>(
    () => ({
      limit: 100,
      sort: 'dueDate',
      search: filters?.search || undefined,
      type: filters?.type,
      status: filters?.status,
      ownerId: filters?.ownerId,
      dueAfter: range.after,
      dueBefore: range.before,
    }),
    [filters?.search, filters?.type, filters?.status, filters?.ownerId, range],
  );

  const { activities, loading, refetch } = useActivities(activityFilters);
  const byId = React.useMemo(
    () => new Map(activities.map((a) => [a._id, a])),
    [activities],
  );

  const items = React.useMemo<CalendarItem[]>(
    () =>
      activities
        .filter((a) => a.dueDate)
        .map((a) => ({
          id: a._id,
          date: new Date(a.dueDate as unknown as string),
          label: a.title || a.type,
          color:
            a.status === 'completed' ? STATUS_CHIP.completed : undefined,
        })),
    [activities],
  );

  const [openId, setOpenId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const handleComplete = React.useCallback(
    async (activity: Activity) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/v2/crm/activities/${activity._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            status: 'completed',
            completedAt: new Date(),
          }),
        });
        if (!res.ok) throw new Error('Failed to complete');
        toast({ title: 'Task completed' });
        setOpenId(null);
        await refetch();
      } catch {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to update task. Please try again.',
        });
      } finally {
        setBusy(false);
      }
    },
    [toast, refetch],
  );

  const active = openId ? byId.get(openId) : undefined;
  const href = active ? relatedHref(active) : null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <RecordCalendar
        month={month}
        items={items}
        loading={loading}
        onMonthChange={setMonth}
        onItemClick={(it) => setOpenId(it.id)}
        emptyLabel="No activities due this month"
      />

      {/* Chip click opens a small centered dialog with the activity detail. */}
      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-sm">
          {active ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-[15px] leading-tight">
                  {active.title || active.type}
                </DialogTitle>
              </DialogHeader>
              <div className="text-[12px] capitalize text-muted-foreground">
                {active.type}
                {active.dueDate
                  ? ` · due ${format(new Date(active.dueDate as unknown as string), 'MMM d, yyyy')}`
                  : ''}
                {active.status ? ` · ${active.status}` : ''}
              </div>
              <div className="flex items-center gap-2 pt-2">
                {active.status !== 'completed' && (
                  <Button
                    size="sm"
                    variant="brand"
                    icon={Check}
                    disabled={busy}
                    onClick={() => handleComplete(active)}
                  >
                    Complete
                  </Button>
                )}
                {href && (
                  <Button asChild size="sm" variant="outline" icon={ExternalLink}>
                    <Link href={href}>Open record</Link>
                  </Button>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
