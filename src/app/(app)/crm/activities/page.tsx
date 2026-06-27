'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ModuleShell } from '@/components/shell/module-shell';
import { CrmDataGrid } from '@/components/crm/shared/crm-data-grid';
import { CrmPagination } from '@/components/crm/shared/crm-pagination';
import { CrmFilters } from '@/components/crm/shared/crm-filters';
import { CreateActivityButton } from '@/components/crm/activities/create-activity-button';
import { ActivityFilters } from '@/components/crm/activities/activity-filters';
import { TaskFilters } from '@/components/crm/activities/task-filters';
import { TaskStatsCard } from '@/components/crm/activities/task-stats-card';
import { getActivityColumns } from '@/components/crm/activities/activity-table-columns';
import { getTaskColumns } from '@/components/crm/activities/task-table-columns';
import { useActivities, ActivityFilters as ActivityFilterType } from '@/hooks/crm/use-activities';
import { Activity } from '@/types/crm';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { useDebounce } from 'use-debounce';
import { useToast } from '@/hooks/use-toast';
import { Filter, ListChecks, ListTodo, Search, Activity as ActivityIcon, Table2, CalendarDays } from 'lucide-react';
import { ActivityCalendarView } from '@/components/crm/activities/activity-calendar-view';
import { Button } from '@/components/ui/button';

type ViewMode = 'activities' | 'tasks';

export default function ActivitiesPage() {
  const { toast } = useToast();

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('activities');
  // Display type (table grid vs month calendar) — orthogonal to viewMode.
  const [displayType, setDisplayType] = useState<'table' | 'calendar'>('table');

  // Common filter state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 500);
  const [showFilters, setShowFilters] = useState(false);

  // Activity filters
  const [activityType, setActivityType] = useState<string>('');
  const [activityStatus, setActivityStatus] = useState<string>('');
  const [targetType, setTargetType] = useState<string>('');
  const [ownerId, setOwnerId] = useState<string>('');

  // Task filters
  const [taskStatus, setTaskStatus] = useState<string>('active');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [dueDateAfter, setDueDateAfter] = useState<Date | undefined>();
  const [dueDateBefore, setDueDateBefore] = useState<Date | undefined>();
  const [priority, setPriority] = useState<string>('');

  // Load view preference from localStorage
  useEffect(() => {
    const savedView = localStorage.getItem('crm:activities:viewMode');
    if (savedView === 'activities' || savedView === 'tasks') {
      setViewMode(savedView);
    }
  }, []);

  // Save view preference to localStorage
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('crm:activities:viewMode', mode);
  };

  // Build filters based on view mode
  const filters: ActivityFilterType = useMemo(() => {
    const baseFilters = {
      page,
      limit,
      search: debouncedSearch,
      sort: '-createdAt',
    };

    if (viewMode === 'activities') {
      return {
        ...baseFilters,
        type: activityType && activityType !== 'all' ? activityType : undefined,
        status: activityStatus && activityStatus !== 'all' ? activityStatus : undefined,
        targetType: targetType && targetType !== 'all' ? targetType : undefined,
        ownerId: ownerId && ownerId !== 'all' ? ownerId : undefined,
      };
    } else {
      // Tasks view
      return {
        ...baseFilters,
        type: 'task',
        status: taskStatus === 'all' ? undefined : taskStatus === 'completed' ? 'completed' : 'pending',
        overdue: overdueOnly || undefined,
        dueAfter: dueDateAfter,
        dueBefore: dueDateBefore,
        priority: priority && priority !== 'all' ? priority : undefined,
        sort: 'dueDate', // Sort tasks by due date
      };
    }
  }, [
    page,
    limit,
    debouncedSearch,
    viewMode,
    activityType,
    activityStatus,
    targetType,
    ownerId,
    taskStatus,
    overdueOnly,
    dueDateAfter,
    dueDateBefore,
    priority,
  ]);

  const { activities, loading, error, pagination, refetch } = useActivities(filters);

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (viewMode === 'activities') {
      if (activityType && activityType !== 'all') count++;
      if (activityStatus && activityStatus !== 'all') count++;
      if (targetType && targetType !== 'all') count++;
      if (ownerId && ownerId !== 'all') count++;
    } else {
      if (taskStatus && taskStatus !== 'all') count++;
      if (overdueOnly) count++;
      if (assignedToMe) count++;
      if (dueDateAfter) count++;
      if (dueDateBefore) count++;
      if (priority && priority !== 'all') count++;
    }
    return count;
  }, [
    viewMode,
    activityType,
    activityStatus,
    targetType,
    ownerId,
    taskStatus,
    overdueOnly,
    assignedToMe,
    dueDateAfter,
    dueDateBefore,
    priority,
  ]);

  const handleClearFilters = () => {
    if (viewMode === 'activities') {
      setActivityType('');
      setActivityStatus('');
      setTargetType('');
      setOwnerId('');
    } else {
      setTaskStatus('active');
      setOverdueOnly(false);
      setAssignedToMe(false);
      setDueDateAfter(undefined);
      setDueDateBefore(undefined);
      setPriority('');
    }
  };

  const handleDelete = useCallback(async (activity: Activity) => {
    const typeLabel = activity.type === 'task' ? 'task' : 'activity';
    if (!confirm(`Are you sure you want to delete this ${typeLabel}?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/v2/crm/activities/${activity._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete ${typeLabel}`);
      }

      toast({
        title: `${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} deleted`,
        description: `The ${typeLabel} has been successfully deleted.`,
      });

      refetch();
    } catch (_error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Failed to delete ${typeLabel}. Please try again.`,
      });
    }
  }, [toast, refetch]);

  const handleToggleComplete = useCallback(async (activity: Activity) => {
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
        throw new Error('Failed to update task');
      }

      toast({
        title: 'Task updated',
        description: activity.status === 'completed' ? 'Task marked as incomplete' : 'Task marked as complete',
      });

      refetch();
    } catch (_error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update task. Please try again.',
      });
    }
  }, [toast, refetch]);

  const columns = useMemo(
    () => {
      if (viewMode === 'activities') {
        return getActivityColumns(handleDelete);
      } else {
        return getTaskColumns(handleDelete, handleToggleComplete);
      }
    },
    [viewMode, handleDelete, handleToggleComplete]
  );

  const filterComponents = useMemo(() => {
    if (viewMode === 'activities') {
      return [
        {
          key: 'type',
          label: 'Activity Type',
          component: (
            <ActivityFilters
              type={activityType}
              status={activityStatus}
              targetType={targetType}
              onTypeChange={(value) => {
                setActivityType(value);
                setPage(1);
              }}
              onStatusChange={(value) => {
                setActivityStatus(value);
                setPage(1);
              }}
              onTargetTypeChange={(value) => {
                setTargetType(value);
                setPage(1);
              }}
            />
          ),
        },
      ];
    } else {
      return [
        {
          key: 'task-filters',
          label: 'Task Filters',
          component: (
            <TaskFilters
              status={taskStatus}
              overdueOnly={overdueOnly}
              assignedToMe={assignedToMe}
              dueDateAfter={dueDateAfter}
              dueDateBefore={dueDateBefore}
              priority={priority}
              onStatusChange={(value) => {
                setTaskStatus(value);
                setPage(1);
              }}
              onOverdueOnlyChange={(value) => {
                setOverdueOnly(value);
                setPage(1);
              }}
              onAssignedToMeChange={(value) => {
                setAssignedToMe(value);
                setPage(1);
              }}
              onDueDateAfterChange={(value) => {
                setDueDateAfter(value);
                setPage(1);
              }}
              onDueDateBeforeChange={(value) => {
                setDueDateBefore(value);
                setPage(1);
              }}
              onPriorityChange={(value) => {
                setPriority(value);
                setPage(1);
              }}
            />
          ),
        },
      ];
    }
  }, [
    viewMode,
    activityType,
    activityStatus,
    targetType,
    taskStatus,
    overdueOnly,
    assignedToMe,
    dueDateAfter,
    dueDateBefore,
    priority,
  ]);

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search activities…"
          className="h-9 pl-8"
        />
      </div>
      <Tabs value={viewMode} onValueChange={(v) => handleViewModeChange(v as ViewMode)}>
        <TabsList>
          <TabsTrigger value="activities" className="gap-2">
            <ActivityIcon className="size-4" />
            All Activities
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-2">
            <ListTodo className="size-4" />
            My Tasks
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Tabs value={displayType} onValueChange={(v) => setDisplayType(v as 'table' | 'calendar')}>
        <TabsList>
          <TabsTrigger value="table" className="gap-2">
            <Table2 className="size-4" />
            Table
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2">
            <CalendarDays className="size-4" />
            Calendar
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <Button
        variant="outline"
        size="sm"
        className="h-9 shrink-0"
        onClick={() => setShowFilters(!showFilters)}
      >
        <Filter className="mr-1.5 size-4" />
        Filters
        {activeFilterCount > 0 && (
          <span className="ml-1.5 rounded-full bg-[var(--accent-100)] px-1.5 text-[11px] font-bold tabular-nums text-[var(--accent-700)]">
            {activeFilterCount}
          </span>
        )}
      </Button>
    </div>
  );

  return (
    <ModuleShell
      title="Activities"
      icon={ListChecks}
      meta={pagination ? `${pagination.total} total` : 'Manage your activities and tasks'}
      onAskAI={() => window.dispatchEvent(new CustomEvent('open-agent', { detail: { prompt: 'Review my overdue tasks and suggest next actions to clear them.' } }))}
      primaryAction={<CreateActivityButton onSuccess={refetch} />}
      filterBar={filterBar}
      error={error ? { title: 'Error loading activities', message: error, onRetry: refetch } : null}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      {viewMode === 'tasks' && displayType === 'table' && <TaskStatsCard filters={filters} />}

      {showFilters && (
        <CrmFilters
          filters={filterComponents}
          onClearAll={handleClearFilters}
          show={showFilters}
        />
      )}

      {displayType === 'calendar' ? (
        <ActivityCalendarView
          filters={{
            search: debouncedSearch || undefined,
            type: viewMode === 'tasks' ? 'task' : undefined,
            status:
              viewMode === 'tasks'
                ? taskStatus === 'all'
                  ? undefined
                  : taskStatus === 'completed'
                    ? 'completed'
                    : 'pending'
                : activityStatus && activityStatus !== 'all'
                  ? activityStatus
                  : undefined,
            ownerId: ownerId && ownerId !== 'all' ? ownerId : undefined,
          }}
        />
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card p-0.5">
            <CrmDataGrid
              className="border-none"
              columns={columns}
              data={activities}
              loading={loading}
              enableSorting
              getRowId={(row) => row._id}
              emptyMessage={
                viewMode === 'activities'
                  ? 'No activities found'
                  : 'No tasks found'
              }
              emptyDescription={
                viewMode === 'activities'
                  ? 'Get started by creating your first activity'
                  : 'Create a task to get started'
              }
            />
          </div>

          {pagination && (
            <CrmPagination
              pagination={pagination}
              onPageChange={setPage}
              onLimitChange={(newLimit) => {
                setLimit(newLimit);
                setPage(1);
              }}
            />
          )}
        </>
      )}
    </ModuleShell>
  );
}
