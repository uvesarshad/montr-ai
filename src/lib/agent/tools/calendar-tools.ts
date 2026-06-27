/**
 * Calendar agent tools (B1-2.8; rewritten Phase 2 2026-06-05).
 * Reuses existing CRM calendar sync (crm_calendar_accounts).
 *
 * NOTE: these call repositories directly — agent tools run server-side
 * (worker + route handlers) where a relative fetch('/api/...') has no base
 * URL and no session cookie. The original fetch-based implementation could
 * never succeed (and check_availability targeted a route that doesn't exist).
 */

import { z } from 'zod';
import { tool } from 'ai';
import { toolRegistry } from '../tool-registry';
import type { AgentContext } from './types';
import { calendarEventRepository } from '@/lib/db/repository/crm/calendar-event.repository';
import { calendarAccountRepository } from '@/lib/db/repository/crm/calendar-account.repository';
import { publishDomainEvent } from '@/lib/events/domain-bus';

/** Pick the user's best calendar (active account, primary calendar first). */
async function resolveCalendar(context: AgentContext): Promise<
    | { accountId: string; calendarId: string; accountEmail: string }
    | null
> {
    const accounts = await calendarAccountRepository.findByUser(context.userId);
    const active = accounts.filter((a) => a.isActive);
    for (const account of active.length ? active : accounts) {
        const calendars = account.calendars ?? [];
        const writable = calendars.filter((c) => c.accessRole !== 'reader');
        const primary = writable.find((c) => c.isPrimary) ?? writable[0];
        if (primary) {
            return {
                accountId: account._id.toString(),
                calendarId: primary.calendarId,
                accountEmail: account.email,
            };
        }
    }
    return null;
}

const createCalendarEventTool = {
    name: 'create_calendar_event',
    description: 'Create a calendar event (meeting) on the user\'s connected calendar and invite participants.',
    parameters: z.object({
        title: z.string(),
        startAt: z.string().describe('ISO 8601 start datetime.'),
        endAt: z.string().describe('ISO 8601 end datetime.'),
        attendeeEmails: z.array(z.string()).optional().describe('Emails to invite.'),
        contactIds: z.array(z.string()).optional().describe('CRM contact IDs to link to this meeting.'),
        description: z.string().optional(),
        location: z.string().optional(),
        meetingLink: z.string().optional(),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Create a calendar event.',
        parameters: z.object({
            title: z.string(),
            startAt: z.string(),
            endAt: z.string(),
            attendeeEmails: z.array(z.string()).optional(),
            contactIds: z.array(z.string()).optional(),
            description: z.string().optional(),
            location: z.string().optional(),
            meetingLink: z.string().optional(),
        }),
        execute: async (args) => {
            try {
                const startTime = new Date(args.startAt);
                const endTime = new Date(args.endAt);
                if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
                    return { success: false, error: 'startAt/endAt must be valid ISO 8601 datetimes.' };
                }
                if (endTime <= startTime) {
                    return { success: false, error: 'endAt must be after startAt.' };
                }

                const calendar = await resolveCalendar(context);
                if (!calendar) {
                    return {
                        success: false,
                        error: 'No connected calendar account found. Ask the user to connect Google or Outlook calendar in CRM settings.',
                    };
                }

                const event = await calendarEventRepository.create({
                    accountId: calendar.accountId,
                    eventId: `local-${Date.now()}`, // Temporary ID until synced
                    calendarId: calendar.calendarId,
                    title: args.title,
                    description: args.description,
                    location: args.location,
                    meetingLink: args.meetingLink,
                    startTime,
                    endTime,
                    attendees: (args.attendeeEmails ?? []).map((email) => ({
                        email,
                        status: 'pending' as const,
                        optional: false,
                    })),
                    contactIds: args.contactIds,
                });

                const eventId = event._id.toString();

                // Phase 2 (2026-06-05): meeting.booked event for agent mission
                // triggers (e.g. "meeting booked → call reminder + WhatsApp details").
                try {
                    publishDomainEvent({
                        type: 'meeting.booked',
                        brandId: context.brandId,
                        source: 'agent.calendar-tools',
                        payload: {
                            eventId,
                            title: args.title,
                            startAt: startTime.toISOString(),
                            endAt: endTime.toISOString(),
                            contactIds: args.contactIds ?? [],
                            attendeeEmails: args.attendeeEmails ?? [],
                        },
                    });
                } catch (err) {
                    console.error('[calendar-tools] meeting.booked publish failed:', err);
                }

                return {
                    success: true,
                    eventId,
                    calendar: calendar.accountEmail,
                    message: `Event "${args.title}" created for ${startTime.toISOString()}.`,
                };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

const checkAvailabilityTool = {
    name: 'check_availability',
    description: 'Check the user\'s calendar for conflicts in a time range. Returns existing events overlapping the range.',
    parameters: z.object({
        startAt: z.string().describe('ISO 8601 start of range.'),
        endAt: z.string().describe('ISO 8601 end of range.'),
    }),
    factory: (context: AgentContext) => tool({
        description: 'Check calendar conflicts in a time range.',
        parameters: z.object({
            startAt: z.string(),
            endAt: z.string(),
        }),
        execute: async (args) => {
            try {
                const startAfter = new Date(args.startAt);
                const startBefore = new Date(args.endAt);
                if (Number.isNaN(startAfter.getTime()) || Number.isNaN(startBefore.getTime())) {
                    return { success: false, error: 'startAt/endAt must be valid ISO 8601 datetimes.' };
                }

                const result = await calendarEventRepository.find(
                    { startAfter, startBefore, status: 'confirmed' },
                    { page: 1, limit: 50, sort: 'startTime', sortDirection: 'asc' },
                );

                const events = (result.data ?? []).map((e) => ({
                    id: e._id.toString(),
                    title: e.title,
                    startTime: e.startTime?.toISOString(),
                    endTime: e.endTime?.toISOString(),
                }));

                return {
                    success: true,
                    busy: events.length > 0,
                    conflicts: events,
                    message: events.length
                        ? `${events.length} existing event(s) in that range.`
                        : 'The range is free.',
                };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        },
    }),
};

toolRegistry.register(createCalendarEventTool);
toolRegistry.register(checkAvailabilityTool);
