'use client';

import { CalendarEvent } from '@/hooks/crm/use-calendar-events';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MapPin, Video, Users } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';

interface EventCardProps {
  event: CalendarEvent;
  compact?: boolean;
}

export function EventCard({ event, compact }: EventCardProps) {
  const startTime = format(new Date(event.startTime), 'h:mm a');
  const endTime = format(new Date(event.endTime), 'h:mm a');

  if (compact) {
    return (
      <Link href={`/crm/calendar/events/${event.id}`}>
        <div className="rounded-md border bg-card p-2 text-xs hover:bg-muted/50 transition-colors">
          <div className="font-medium truncate">{event.title}</div>
          <div className="text-muted-foreground">
            {startTime}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={`/crm/calendar/events/${event.id}`}>
      <div className="rounded-lg border bg-card p-4 hover:bg-muted/50 transition-colors">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-2">
              <h4 className="font-semibold">{event.title}</h4>
              {event.status === 'tentative' && (
                <Badge variant="outline">Tentative</Badge>
              )}
              {event.isRecurring && (
                <Badge variant="outline">Recurring</Badge>
              )}
            </div>

            <div className="space-y-1 text-sm text-muted-foreground">
              <div>
                {startTime} - {endTime}
              </div>

              {event.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {event.location}
                </div>
              )}

              {event.meetingLink && (
                <div className="flex items-center gap-1">
                  <Video className="size-3" />
                  <a
                    href={event.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Join meeting
                  </a>
                </div>
              )}

              {event.attendees.length > 0 && (
                <div className="flex items-center gap-1">
                  <Users className="size-3" />
                  {event.attendees.length} attendee{event.attendees.length > 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>

          {event.organizer && (
            <Avatar className="size-8">
              <AvatarFallback className="text-xs">
                {event.organizer.name?.[0]?.toUpperCase() || event.organizer.email[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </Link>
  );
}
