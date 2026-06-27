'use client';

import { CalendarEvent } from '@/hooks/crm/use-calendar-events';
import { EventCard } from './event-card';
import { format, isSameDay } from 'date-fns';

interface EventListProps {
  events: CalendarEvent[];
}

export function EventList({ events }: EventListProps) {
  // Group events by date
  const groupedEvents: { date: Date; events: CalendarEvent[] }[] = [];
  let currentDate: Date | null = null;

  events.forEach((event) => {
    const eventDate = new Date(event.startTime);
    if (!currentDate || !isSameDay(eventDate, currentDate)) {
      currentDate = eventDate;
      groupedEvents.push({ date: eventDate, events: [event] });
    } else {
      groupedEvents[groupedEvents.length - 1].events.push(event);
    }
  });

  if (events.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">No events found</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groupedEvents.map(({ date, events }) => (
        <div key={date.toISOString()}>
          <h3 className="mb-3 text-lg font-semibold">
            {format(date, 'EEEE, MMMM d, yyyy')}
          </h3>
          <div className="space-y-2">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
