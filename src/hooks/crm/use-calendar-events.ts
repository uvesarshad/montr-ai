import { useState, useEffect, useCallback } from 'react';

export interface CalendarEvent {
  id: string;
  accountId: string;
  eventId: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  meetingLink?: string;
  startTime: Date;
  endTime: Date;
  timezone?: string;
  isAllDay: boolean;
  isRecurring: boolean;
  organizer?: {
    email: string;
    name?: string;
    self: boolean;
  };
  attendees: Array<{
    email: string;
    name?: string;
    status: 'pending' | 'accepted' | 'declined' | 'tentative';
    optional: boolean;
  }>;
  status: 'confirmed' | 'tentative' | 'cancelled';
  contactIds: string[];
  companyId?: string;
  dealId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CalendarEventFilters {
  accountId?: string;
  calendarId?: string;
  contactIds?: string[];
  companyId?: string;
  dealId?: string;
  startAfter?: Date;
  startBefore?: Date;
  status?: 'confirmed' | 'tentative' | 'cancelled';
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: string;
  sortDirection?: 'asc' | 'desc';
}

export function useCalendarEvents(
  filters: CalendarEventFilters = {},
  options: PaginationOptions = {}
) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
    hasMore: false,
  });

  const filtersKey = JSON.stringify(filters);
  const optionsKey = JSON.stringify(options);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set('page', (options.page || 1).toString());
      params.set('limit', (options.limit || 50).toString());
      params.set('sort', options.sort || 'startTime');
      params.set('sortDirection', options.sortDirection || 'asc');

      if (filters.accountId) params.set('accountId', filters.accountId);
      if (filters.calendarId) params.set('calendarId', filters.calendarId);
      if (filters.contactIds) params.set('contactIds', filters.contactIds.join(','));
      if (filters.companyId) params.set('companyId', filters.companyId);
      if (filters.dealId) params.set('dealId', filters.dealId);
      if (filters.status) params.set('status', filters.status);
      if (filters.startAfter) params.set('startAfter', filters.startAfter.toISOString());
      if (filters.startBefore) params.set('startBefore', filters.startBefore.toISOString());

      const response = await fetch(`/api/v2/crm/events?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch calendar events');
      }

      const result = await response.json();
      setEvents(result.data || []);
      setPagination(result.pagination || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch calendar events');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, optionsKey]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const linkToEntity = useCallback(async (
    id: string,
    links: { contactIds?: string[]; companyId?: string; dealId?: string }
  ) => {
    try {
      const response = await fetch(`/api/v2/crm/events/${id}/link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(links),
      });

      if (!response.ok) {
        throw new Error('Failed to link event');
      }

      await fetchEvents();
    } catch (err) {
      throw err;
    }
  }, [fetchEvents]);

  const deleteEvent = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/v2/crm/events/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete event');
      }

      await fetchEvents();
    } catch (err) {
      throw err;
    }
  }, [fetchEvents]);

  return {
    events,
    loading,
    error,
    pagination,
    refetch: fetchEvents,
    linkToEntity,
    deleteEvent,
  };
}

export function useCalendarEvent(id: string) {
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvent = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/v2/crm/events/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch calendar event');
      }

      const result = await response.json();
      setEvent(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch calendar event');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEvent();
  }, [fetchEvent]);

  return {
    event,
    loading,
    error,
    refetch: fetchEvent,
  };
}
