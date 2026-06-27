'use client';

import { Loader2 } from 'lucide-react';

import { CalendarAccount } from '@/hooks/crm/use-calendar-accounts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CalendarEventFormState } from './calendar-event-dialog-helpers';

interface CalendarEventFormProps {
  accounts: CalendarAccount[];
  form: CalendarEventFormState;
  submitting?: boolean;
  submitLabel: string;
  onChange: (updater: (current: CalendarEventFormState) => CalendarEventFormState) => void;
  onSubmit: (event: React.FormEvent) => void;
  onCancel?: () => void;
}

export function CalendarEventForm({
  accounts,
  form,
  submitting = false,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: CalendarEventFormProps) {
  const selectedAccount = accounts.find((account) => account.id === form.accountId);
  const availableCalendars = selectedAccount?.calendars || [];

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="accountId">Calendar Account</Label>
          <Select
            value={form.accountId}
            onValueChange={(accountId) => onChange((current) => ({ ...current, accountId }))}
          >
            <SelectTrigger id="accountId">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.displayName || account.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="calendarId">Calendar</Label>
          <Select
            value={form.calendarId}
            onValueChange={(calendarId) => onChange((current) => ({ ...current, calendarId }))}
          >
            <SelectTrigger id="calendarId">
              <SelectValue placeholder="Select calendar" />
            </SelectTrigger>
            <SelectContent>
              {availableCalendars.map((calendar) => (
                <SelectItem key={calendar.calendarId} value={calendar.calendarId}>
                  {calendar.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={form.title}
          onChange={(event) => onChange((current) => ({ ...current, title: event.target.value }))}
          placeholder="Discovery call with Acme"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="startTime">Start</Label>
          <Input
            id="startTime"
            type="datetime-local"
            value={form.startTime}
            onChange={(event) => onChange((current) => ({ ...current, startTime: event.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endTime">End</Label>
          <Input
            id="endTime"
            type="datetime-local"
            value={form.endTime}
            onChange={(event) => onChange((current) => ({ ...current, endTime: event.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="attendeeEmails">Attendees</Label>
        <Input
          id="attendeeEmails"
          value={form.attendeeEmails}
          onChange={(event) =>
            onChange((current) => ({ ...current, attendeeEmails: event.target.value }))
          }
          placeholder="ava@example.com, ben@example.com"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            value={form.location}
            onChange={(event) => onChange((current) => ({ ...current, location: event.target.value }))}
            placeholder="Conference Room A"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="meetingLink">Meeting Link</Label>
          <Input
            id="meetingLink"
            value={form.meetingLink}
            onChange={(event) =>
              onChange((current) => ({ ...current, meetingLink: event.target.value }))
            }
            placeholder="https://meet.google.com/..."
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={form.description}
          onChange={(event) =>
            onChange((current) => ({ ...current, description: event.target.value }))
          }
          rows={4}
          placeholder="Agenda, notes, and meeting context..."
        />
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
