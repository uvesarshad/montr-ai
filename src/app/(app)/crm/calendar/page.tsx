'use client';

import { useState, useCallback } from 'react';
import { useCalendarEvents } from '@/hooks/crm/use-calendar-events';
import { useCalendarAccounts } from '@/hooks/crm/use-calendar-accounts';
import { CalendarView } from '@/components/crm/calendar/calendar-view';
import { EventList } from '@/components/crm/calendar/event-list';
import { CreateEventDialog } from '@/components/crm/calendar/create-event-dialog';
import { ModuleShell } from '@/components/shell/module-shell';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarDays, List, RefreshCw, Plus } from 'lucide-react';
import { addDays, startOfWeek, endOfWeek } from 'date-fns';

export default function CalendarPage() {
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();

  // Calculate date range for current week
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 0 });

  const { accounts, loading: accountsLoading, syncAccount } = useCalendarAccounts();

  const {
    events,
    loading,
    error,
    refetch,
  } = useCalendarEvents(
    {
      accountId: selectedAccountId,
      startAfter: weekStart,
      startBefore: weekEnd,
      status: 'confirmed',
    },
    { limit: 100, sort: 'startTime', sortDirection: 'asc' }
  );

  const handleSync = useCallback(async () => {
    if (!selectedAccountId) {
      // Sync all accounts
      for (const account of accounts) {
        try {
          await syncAccount(account.id);
        } catch (error) {
          console.error('Error syncing account:', error);
        }
      }
    } else {
      await syncAccount(selectedAccountId);
    }
    await refetch();
  }, [accounts, refetch, selectedAccountId, syncAccount]);

  const handlePrevWeek = () => {
    setSelectedDate(addDays(selectedDate, -7));
  };

  const handleNextWeek = () => {
    setSelectedDate(addDays(selectedDate, 7));
  };

  const handleToday = () => {
    setSelectedDate(new Date());
  };

  const filterBar = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {/* Account selector */}
        <Select value={selectedAccountId || 'all'} onValueChange={(value) => {
          setSelectedAccountId(value === 'all' ? undefined : value);
        }}>
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue placeholder="All calendars" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All calendars</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* View mode toggle */}
        <div className="flex gap-1">
          <Button
            variant={viewMode === 'calendar' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('calendar')}
          >
            <CalendarDays className="mr-2 size-4" />
            Calendar
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
          >
            <List className="mr-2 size-4" />
            List
          </Button>
        </div>
      </div>

      {/* Date navigation — only shown in calendar view */}
      {viewMode === 'calendar' && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrevWeek}>
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={handleToday}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={handleNextWeek}>
            Next
          </Button>
        </div>
      )}
    </div>
  );

  const calendarPrimaryAction = (
    <CreateEventDialog
      onCreated={refetch}
      trigger={
        <Button size="sm">
          <Plus className="mr-2 size-4" />
          New Event
        </Button>
      }
    />
  );

  const calendarSecondaryActions = (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSync}
      disabled={accountsLoading}
    >
      <RefreshCw className="mr-2 size-4" />
      Sync
    </Button>
  );

  return (
    <ModuleShell
      title="Calendar"
      icon={CalendarDays}
      meta="Manage your events and schedules"
      secondaryActions={calendarSecondaryActions}
      primaryAction={calendarPrimaryAction}
      filterBar={filterBar}
      error={error ? { title: 'Error loading events', message: error, onRetry: refetch } : null}
      contentClassName="min-h-0 flex-1 flex flex-col"
    >
      <div className="flex-1 overflow-auto rounded-xl border border-border bg-card p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-muted-foreground">Loading events...</div>
          </div>
        ) : viewMode === 'calendar' ? (
          <CalendarView
            events={events}
            selectedDate={selectedDate}
            weekStart={weekStart}
            weekEnd={weekEnd}
          />
        ) : (
          <EventList events={events} />
        )}
      </div>
    </ModuleShell>
  );
}
