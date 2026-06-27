import { ICrmCalendarAccount } from '@/lib/db/models/crm/calendar-account.model';
import { calendarEventRepository } from '@/lib/db/repository/crm/calendar-event.repository';
import { calendarAccountRepository } from '@/lib/db/repository/crm/calendar-account.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { refreshCalendarOAuthToken } from './index';

interface OutlookCalendarEvent {
  id: string;
  iCalUId: string;
  subject: string;
  bodyPreview?: string;
  body?: {
    contentType: string;
    content: string;
  };
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: {
    displayName: string;
  };
  isAllDay: boolean;
  isCancelled: boolean;
  isOrganizer: boolean;
  organizer?: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  attendees?: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
    status: {
      response: string;
    };
    type: string;
  }>;
  recurrence?: Record<string, unknown>;
  seriesMasterId?: string;
  onlineMeeting?: {
    joinUrl: string;
  };
  webLink?: string;
  responseStatus?: {
    response: string;
  };
  showAs: string;
}

/**
 * Sync Outlook Calendar account events
 */
export async function syncOutlookCalendar(account: ICrmCalendarAccount): Promise<void> {
  try {
    console.log(`[Outlook Calendar Sync] Starting sync for account: ${account.email}`);

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
      const calendars = await fetchOutlookCalendars(accessToken);
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
        const events = await fetchOutlookCalendarEvents(
          accessToken,
          calendar.calendarId,
          account.syncStartDate
        );

        console.log(`[Outlook Calendar Sync] Found ${events.length} events in calendar ${calendar.name}`);

        for (const event of events) {
          try {
            // Skip cancelled events
            if (event.isCancelled) {
              await calendarEventRepository.deleteByEventId(
                account._id.toString(),
                event.id
              );
              continue;
            }

            // Parse event
            const parsedEvent = parseOutlookCalendarEvent(event, calendar.calendarId);

            // Auto-link to contacts if enabled
            const contactIds: string[] = [];
            if (account.autoLinkContacts && event.attendees) {
              for (const attendee of event.attendees) {
                const contact = await contactRepository.findByEmail(
                  attendee.emailAddress.address
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
            console.error(`[Outlook Calendar Sync] Error syncing event ${event.id}:`, error);
          }
        }
      } catch (error) {
        console.error(`[Outlook Calendar Sync] Error syncing calendar ${calendar.name}:`, error);
      }
    }

    console.log(`[Outlook Calendar Sync] Successfully synced ${totalSynced} events`);

    // Update sync state
    await calendarAccountRepository.updateSyncState(account._id.toString(), {
      lastSyncAt: new Date(),
      lastSyncError: undefined,
    });
  } catch (error) {
    console.error(`[Outlook Calendar Sync] Error syncing account ${account.email}:`, error);

    // Update sync state with error
    await calendarAccountRepository.updateSyncState(account._id.toString(), {
      lastSyncAt: new Date(),
      lastSyncError: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

/**
 * Fetch Outlook calendars
 */
async function fetchOutlookCalendars(accessToken: string) {
  const response = await fetch(
    'https://graph.microsoft.com/v1.0/me/calendars',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch Outlook calendars');
  }

  const data = await response.json();

  interface OutlookCalendarListEntry {
    id: string;
    name: string;
    color?: string;
    isDefaultCalendar?: boolean;
    canEdit?: boolean;
  }
  return (data.value || []).map((calendar: OutlookCalendarListEntry) => ({
    calendarId: calendar.id,
    name: calendar.name,
    color: calendar.color,
    isPrimary: calendar.isDefaultCalendar || false,
    syncEnabled: calendar.isDefaultCalendar || false,
    accessRole: calendar.canEdit ? 'owner' : 'reader',
  }));
}

/**
 * Fetch Outlook Calendar events
 */
async function fetchOutlookCalendarEvents(
  accessToken: string,
  calendarId: string,
  syncStartDate?: Date
): Promise<OutlookCalendarEvent[]> {
  const url = new URL(
    `https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/events`
  );

  url.searchParams.set('$top', '250');
  url.searchParams.set('$orderby', 'start/dateTime');

  if (syncStartDate) {
    const filter = `start/dateTime ge '${syncStartDate.toISOString()}'`;
    url.searchParams.set('$filter', filter);
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch Outlook Calendar events');
  }

  const data = await response.json();
  return data.value || [];
}

/**
 * Parse Outlook Calendar event
 */
function parseOutlookCalendarEvent(event: OutlookCalendarEvent, calendarId: string) {
  const startTime = new Date(event.start.dateTime);
  const endTime = new Date(event.end.dateTime);

  const attendees = (event.attendees || []).map((attendee) => ({
    email: attendee.emailAddress.address,
    name: attendee.emailAddress.name,
    status: mapOutlookResponseStatus(attendee.status.response),
    optional: attendee.type === 'optional',
  }));

  const organizer = event.organizer
    ? {
        email: event.organizer.emailAddress.address,
        name: event.organizer.emailAddress.name,
        self: event.isOrganizer,
      }
    : undefined;

  return {
    calendarId,
    title: event.subject || '(No Title)',
    description: event.body?.content,
    location: event.location?.displayName,
    meetingLink: event.onlineMeeting?.joinUrl,
    startTime,
    endTime,
    timezone: event.start.timeZone,
    isAllDay: event.isAllDay,
    isRecurring: !!event.recurrence || !!event.seriesMasterId,
    recurringEventId: event.seriesMasterId,
    iCalUID: event.iCalUId,
    organizer,
    attendees,
    status: event.isCancelled ? 'cancelled' : mapOutlookEventStatus(event.responseStatus?.response),
    busy: event.showAs === 'free' ? 'free' : 'busy',
    htmlLink: event.webLink,
  };
}

/**
 * Map Outlook event status
 */
function mapOutlookEventStatus(status?: string): 'confirmed' | 'tentative' | 'cancelled' {
  switch (status) {
    case 'accepted':
      return 'confirmed';
    case 'tentativelyAccepted':
      return 'tentative';
    case 'declined':
      return 'cancelled';
    default:
      return 'confirmed';
  }
}

/**
 * Map Outlook attendee response status
 */
function mapOutlookResponseStatus(
  status: string
): 'pending' | 'accepted' | 'declined' | 'tentative' {
  switch (status) {
    case 'accepted':
      return 'accepted';
    case 'declined':
      return 'declined';
    case 'tentativelyAccepted':
      return 'tentative';
    case 'none':
    case 'notResponded':
    default:
      return 'pending';
  }
}
