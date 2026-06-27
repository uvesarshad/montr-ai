'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, Trash2 } from 'lucide-react';

import { useCalendarAccounts } from '@/hooks/crm/use-calendar-accounts';
import { useCalendarEvent } from '@/hooks/crm/use-calendar-events';
import { useToast } from '@/hooks/use-toast';
import { CalendarEventForm } from '@/components/crm/calendar/calendar-event-form';
import {
  buildCalendarEventFormState,
  buildCalendarEventPayload,
  CalendarEventFormState,
} from '@/components/crm/calendar/calendar-event-dialog-helpers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export default function CalendarEventPage() {
  const params = useParams<{ id: string }>();
  const eventId = typeof params?.id === 'string' ? params.id : '';
  const router = useRouter();
  const { toast } = useToast();
  const { event, loading, error, refetch } = useCalendarEvent(eventId);
  const { accounts } = useCalendarAccounts();
  const [form, setForm] = useState<CalendarEventFormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (event) {
      setForm(buildCalendarEventFormState(event));
    }
  }, [event]);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === form?.accountId),
    [accounts, form?.accountId]
  );

  const availableCalendars = useMemo(
    () => selectedAccount?.calendars || [],
    [selectedAccount]
  );

  useEffect(() => {
    if (!form || !selectedAccount) {
      return;
    }

    if (!availableCalendars.some((calendar) => calendar.calendarId === form.calendarId)) {
      const nextCalendar =
        availableCalendars.find((calendar) => calendar.isPrimary) || availableCalendars[0];

      if (nextCalendar) {
        setForm((current) => current ? { ...current, calendarId: nextCalendar.calendarId } : current);
      }
    }
  }, [availableCalendars, form, selectedAccount]);

  const handleSubmit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();

    if (!eventId || !form || !form.accountId || !form.calendarId || !form.title.trim()) {
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
      const response = await fetch(`/api/v2/crm/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update event');
      }

      toast({
        title: 'Event updated',
        description: 'The calendar event has been saved.',
      });
      await refetch();
    } catch (submitError) {
      toast({
        variant: 'destructive',
        title: 'Failed to update event',
        description: submitError instanceof Error ? submitError.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!eventId || !confirm('Delete this calendar event?')) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`/api/v2/crm/events/${eventId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete event');
      }

      toast({
        title: 'Event deleted',
        description: 'The calendar event has been removed.',
      });
      router.push('/crm/calendar');
      router.refresh();
    } catch (deleteError) {
      toast({
        variant: 'destructive',
        title: 'Failed to delete event',
        description: deleteError instanceof Error ? deleteError.message : 'Please try again.',
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading || !form) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[520px] w-full" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="space-y-6 p-6">
        <Link href="/crm/calendar" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 size-4" />
          Back to Calendar
        </Link>
        <Card className="border-destructive/40">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error || 'Event not found.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-10">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <Link href="/crm/calendar" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="mr-2 size-4" />
              Back to Calendar
            </Link>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{event.status}</Badge>
              {event.isRecurring && <Badge variant="secondary">Recurring</Badge>}
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold">{event.title}</h1>
              <p className="text-sm text-muted-foreground">
                Review, reschedule, or remove this CRM-linked calendar event.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1">
                <CalendarDays className="size-4" />
                {new Date(event.startTime).toLocaleString()}
              </span>
              <span className="rounded-full bg-secondary px-3 py-1">
                {event.attendees.length} attendee{event.attendees.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
            className="shrink-0"
          >
            <Trash2 className="mr-2 size-4" />
            {deleting ? 'Deleting...' : 'Delete Event'}
          </Button>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Edit Event</CardTitle>
          </CardHeader>
          <CardContent>
            <CalendarEventForm
              accounts={accounts}
              form={form}
              submitting={submitting}
              submitLabel="Save Changes"
              onChange={(updater) => setForm((current) => current ? updater(current) : current)}
              onSubmit={handleSubmit}
              onCancel={() => router.push('/crm/calendar')}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
