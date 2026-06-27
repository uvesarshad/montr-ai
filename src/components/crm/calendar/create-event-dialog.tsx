'use client';

import { useEffect, useMemo, useState } from 'react';
import { addHours, format } from 'date-fns';
import { Plus } from 'lucide-react';

import { useCalendarAccounts } from '@/hooks/crm/use-calendar-accounts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  buildCalendarEventPayload,
  CalendarEventFormState,
  getDefaultCalendarSelection,
} from './calendar-event-dialog-helpers';
import { CalendarEventForm } from './calendar-event-form';

interface CreateEventDialogProps {
  onCreated?: () => Promise<void> | void;
  trigger?: React.ReactNode;
}

function createInitialState(accounts: ReturnType<typeof useCalendarAccounts>['accounts']): CalendarEventFormState {
  const defaults = getDefaultCalendarSelection(accounts);
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = addHours(start, 1);

  return {
    accountId: defaults.accountId,
    calendarId: defaults.calendarId,
    title: '',
    description: '',
    location: '',
    meetingLink: '',
    startTime: format(start, "yyyy-MM-dd'T'HH:mm"),
    endTime: format(end, "yyyy-MM-dd'T'HH:mm"),
    attendeeEmails: '',
  };
}

export function CreateEventDialog({ onCreated, trigger }: CreateEventDialogProps) {
  const { toast } = useToast();
  const { accounts } = useCalendarAccounts();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<CalendarEventFormState>(() => createInitialState([]));

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm((current) => {
      if (current.accountId && current.calendarId) {
        return current;
      }
      return {
        ...current,
        ...getDefaultCalendarSelection(accounts),
      };
    });
  }, [accounts, open]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === form.accountId),
    [accounts, form.accountId]
  );

  const availableCalendars = useMemo(
    () => selectedAccount?.calendars || [],
    [selectedAccount]
  );

  useEffect(() => {
    if (!selectedAccount) {
      return;
    }

    if (!availableCalendars.some((calendar) => calendar.calendarId === form.calendarId)) {
      const nextCalendar =
        availableCalendars.find((calendar) => calendar.isPrimary) || availableCalendars[0];

      if (nextCalendar) {
        setForm((current) => ({
          ...current,
          calendarId: nextCalendar.calendarId,
        }));
      }
    }
  }, [availableCalendars, form.calendarId, selectedAccount]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.accountId || !form.calendarId || !form.title.trim()) {
      toast({
        variant: 'destructive',
        title: 'Missing required fields',
        description: 'Account, calendar, and title are required.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildCalendarEventPayload(form);
      const response = await fetch('/api/v2/crm/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create event');
      }

      toast({
        title: 'Event created',
        description: 'The calendar event has been added to CRM.',
      });
      setOpen(false);
      setForm(createInitialState(accounts));
      await onCreated?.();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to create event',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" className="flex items-center gap-2">
            <Plus className="size-4" />
            New Event
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[620px]">
        <div className="space-y-4">
          <DialogHeader>
            <DialogTitle>Create Calendar Event</DialogTitle>
            <DialogDescription>
              Add a new event to a connected calendar account and keep it linked inside CRM.
            </DialogDescription>
          </DialogHeader>

          <CalendarEventForm
            accounts={accounts}
            form={form}
            submitting={submitting}
            submitLabel="Create Event"
            onChange={(updater) => setForm((current) => updater(current))}
            onSubmit={handleSubmit}
            onCancel={() => setOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
