'use client';

import { CalendarEvent } from '@/hooks/crm/use-calendar-events';
import { format, isSameDay, addDays } from 'date-fns';
import { EventCard } from './event-card';

interface CalendarViewProps {
  events: CalendarEvent[];
  selectedDate: Date;
  weekStart: Date;
  weekEnd: Date;
}

export function CalendarView({ events, weekStart }: CalendarViewProps) {
  // Generate 7 days for the week
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Group events by day
  const eventsByDay = days.map((day) => {
    const dayEvents = events.filter((event) =>
      isSameDay(new Date(event.startTime), day)
    );
    return { day, events: dayEvents };
  });

  return (
    <div className="grid grid-cols-7 gap-4">
      {eventsByDay.map(({ day, events }) => (
        <div key={day.toISOString()} className="min-h-[400px] rounded-lg border p-2">
          <div className="mb-2 text-center">
            <div className="text-sm font-semibold">{format(day, 'EEE')}</div>
            <div className={`text-2xl ${isSameDay(day, new Date()) ? 'font-bold text-primary' : ''}`}>
              {format(day, 'd')}
            </div>
          </div>
          <div className="space-y-2">
            {events.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-4">
                No events
              </div>
            ) : (
              events.map((event) => (
                <EventCard key={event.id} event={event} compact />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
