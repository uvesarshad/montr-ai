import { ICrmCalendarAccount } from '@/lib/db/models/crm/calendar-account.model';
import { calendarEventRepository } from '@/lib/db/repository/crm/calendar-event.repository';
import { calendarAccountRepository } from '@/lib/db/repository/crm/calendar-account.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { refreshCalendarOAuthToken } from './index';

interface GoogleCalendarEvent {
  id: string;
  status: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  organizer?: {
    email: string;
    displayName?: string;
    self?: boolean;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus: string;
    optional?: boolean;
  }>;
  recurrence?: string[];
  recurringEventId?: string;
  iCalUID?: string;
  hangoutLink?: string;
  htmlLink?: string;
  etag?: string;
  reminders?: {
    overrides?: Array<{
      method: string;
      minutes: number;
    }>;
  };
}

/**
 * Sync Google Calendar account events
 */
export async function syncGoogleCalendar(account: ICrmCalendarAccount): Promise<void> {
  try {
    console.log(`[Google Calendar Sync] Starting sync for account: ${account.email}`);

    // Refresh OAuth token if needed
    const { accessToken } = await refreshCalendarOAuthToken(account);

    // Update account with fresh token
    if (accessToken !== account.oauth?.accessToken) {
      await calendarAccountRepository.updateOAuth(
        account._id.toString(),
        {
          ...account.oauth!,
          accessToken,
        }
      );
    }

    // Fetch calendar list if not already fetched
    if (!account.calendars || account.calendars.length === 0) {
      const calendars = await fetchGoogleCalendars(accessToken);
      await calendarAccountRepository.updateCalendars(
        account._id.toString(),
        calendars
      );
      account.calendars = calendars;
    }

    let totalSynced = 0;

    // Sync each enabled calendar
    for (const calendar of account.calendars) {
      if (!calendar.syncEnabled) continue;

      try {
        const events = await fetchGoogleCalendarEvents(
          accessToken,
          calendar.calendarId,
          account.syncStartDate,
          account.syncToken
        );

        console.log(`[Google Calendar Sync] Found ${events.length} events in calendar ${calendar.name}`);

        for (const event of events) {
          try {
            // Skip cancelled events
            if (event.status === 'cancelled') {
              await calendarEventRepository.deleteByEventId(
                account._id.toString(),
                event.id
              );
              continue;
            }

            // Parse event
            const parsedEvent = parseGoogleCalendarEvent(event, calendar.calendarId);

            // Auto-link to contacts if enabled
            const contactIds: string[] = [];
            if (account.autoLinkContacts && event.attendees) {
              for (const attendee of event.attendees) {
                const contact = await contactRepository.findByEmail(
                  attendee.email
                );
                if (contact) {
                  contactIds.push(contact._id.toString());
                }
              }
            }

            // Upsert event
            await calendarEventRepository.upsertByEventId(
              account._id.toString(),
              event.id,
              // @ts-expect-error
              {
                ...parsedEvent,
                contactIds: contactIds.length > 0 ? contactIds : undefined,
              }
            );

            totalSynced++;
          } catch (error) {
            console.error(`[Google Calendar Sync] Error syncing event ${event.id}:`, error);
          }
        }
      } catch (error) {
        console.error(`[Google Calendar Sync] Error syncing calendar ${calendar.name}:`, error);
      }
    }

    console.log(`[Google Calendar Sync] Successfully synced ${totalSynced} events`);

    // Update sync state
    await calendarAccountRepository.updateSyncState(account._id.toString(), {
      lastSyncAt: new Date(),
      lastSyncError: undefined,
    });
  } catch (error) {
    console.error(`[Google Calendar Sync] Error syncing account ${account.email}:`, error);

    // Update sync state with error
    await calendarAccountRepository.updateSyncState(account._id.toString(), {
      lastSyncAt: new Date(),
      lastSyncError: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

/**
 * Fetch Google calendars
 */
async function fetchGoogleCalendars(accessToken: string) {
  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch Google calendars');
  }

  const data = await response.json();

  interface GoogleCalendarListEntry {
    id: string;
    summary: string;
    backgroundColor?: string;
    primary?: boolean;
    accessRole?: string;
  }
  return (data.items || []).map((calendar: GoogleCalendarListEntry) => ({
    calendarId: calendar.id,
    name: calendar.summary,
    color: calendar.backgroundColor,
    isPrimary: calendar.primary || false,
    syncEnabled: calendar.primary || false, // Only sync primary by default
    accessRole: calendar.accessRole,
  }));
}

/**
 * Fetch Google Calendar events
 */
async function fetchGoogleCalendarEvents(
  accessToken: string,
  calendarId: string,
  syncStartDate?: Date,
  syncToken?: string
): Promise<GoogleCalendarEvent[]> {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
  );

  url.searchParams.set('maxResults', '250');
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');

  if (syncToken) {
    url.searchParams.set('syncToken', syncToken);
  } else if (syncStartDate) {
    url.searchParams.set('timeMin', syncStartDate.toISOString());
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch Google Calendar events');
  }

  const data = await response.json();
  return data.items || [];
}

/**
 * Parse Google Calendar event
 */
function parseGoogleCalendarEvent(event: GoogleCalendarEvent, calendarId: string) {
  const isAllDay = !!event.start.date;
  const startTime = new Date(event.start.dateTime || event.start.date || '');
  const endTime = new Date(event.end.dateTime || event.end.date || '');

  const attendees = (event.attendees || []).map((attendee) => ({
    email: attendee.email,
    name: attendee.displayName,
    status: mapGoogleResponseStatus(attendee.responseStatus),
    optional: attendee.optional || false,
  }));

  const organizer = event.organizer
    ? {
        email: event.organizer.email,
        name: event.organizer.displayName,
        self: event.organizer.self || false,
      }
    : undefined;

  const reminders = (event.reminders?.overrides || []).map((reminder) => ({
    method: reminder.method === 'email' ? 'email' : 'popup',
    minutes: reminder.minutes,
  }));

  return {
    calendarId,
    title: event.summary || '(No Title)',
    description: event.description,
    location: event.location,
    meetingLink: event.hangoutLink,
    startTime,
    endTime,
    timezone: event.start.timeZone,
    isAllDay,
    isRecurring: !!event.recurrence || !!event.recurringEventId,
    recurrenceRule: event.recurrence?.join(';'),
    recurringEventId: event.recurringEventId,
    iCalUID: event.iCalUID,
    organizer,
    attendees,
    status: mapGoogleEventStatus(event.status),
    reminders,
    htmlLink: event.htmlLink,
    etag: event.etag,
  };
}

/**
 * Map Google event status
 */
function mapGoogleEventStatus(status: string): 'confirmed' | 'tentative' | 'cancelled' {
  switch (status) {
    case 'confirmed':
      return 'confirmed';
    case 'tentative':
      return 'tentative';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'confirmed';
  }
}

/**
 * Map Google attendee response status
 */
function mapGoogleResponseStatus(
  status: string
): 'pending' | 'accepted' | 'declined' | 'tentative' {
  switch (status) {
    case 'accepted':
      return 'accepted';
    case 'declined':
      return 'declined';
    case 'tentative':
      return 'tentative';
    case 'needsAction':
    default:
      return 'pending';
  }
}
