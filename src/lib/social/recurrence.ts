/**
 * Recurring-post engine (social Epic 5).
 *
 * The recurrence MODEL already exists on `IScheduledPost` (frequency
 * daily/weekly/monthly, interval, endDate, daysOfWeek, dayOfMonth, plus
 * parentPostId for the series link). This module exposes it: pure, unit-testable
 * functions that compute the next fire time from a recurrence rule and a
 * just-published post, plus a calendar-preview expander.
 *
 * Timezone discipline (CLAUDE.md / project memory): the codebase sends UTC
 * instants end-to-end. We compute everything in UTC (Date.getUTC* / setUTC*) and
 * never apply timezone conversion — adding one here would double-shift fire
 * times. The stored `timezone` on the post is metadata for display only.
 */

import type {
    IRecurrence,
    IScheduledPost,
    IPlatformConfig,
} from '@/lib/db/models/scheduled-post.model';
import type { CreateScheduledPostInput } from '@/lib/db/repository/scheduled-post.repository';
// NOTE: the repository (and the Mongoose model it loads) is imported DYNAMICALLY
// inside materializeNextRecurrence so that importing this module's pure helpers
// (computeNextOccurrence/expandRecurrencePreview) in unit tests does not pull in
// Mongoose and leave the process's event loop open.

/** Clone a Date so callers' inputs are never mutated. */
function cloneDate(d: Date): Date {
    return new Date(d.getTime());
}

/** True when `candidate` is strictly past the (inclusive) endDate, if any. */
function isPastEndDate(recurrence: IRecurrence, candidate: Date): boolean {
    if (!recurrence.endDate) return false;
    return candidate.getTime() > new Date(recurrence.endDate).getTime();
}

/**
 * Advance a UTC date by whole days, preserving the time-of-day.
 */
function addUtcDays(d: Date, days: number): Date {
    const next = cloneDate(d);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

/**
 * Daily recurrence: the next instant is `from` + interval days, keeping the
 * original time-of-day from the anchor.
 */
function nextDaily(anchor: Date, from: Date, interval: number): Date {
    // Start one interval past the anchor and step forward until strictly after `from`.
    let candidate = addUtcDays(anchor, interval);
    while (candidate.getTime() <= from.getTime()) {
        candidate = addUtcDays(candidate, interval);
    }
    return candidate;
}

/**
 * Weekly recurrence. If `daysOfWeek` is set, the series fires on each listed
 * weekday; interval applies to whole weeks between fire-weeks. Without
 * daysOfWeek we treat it as "every `interval` weeks on the anchor's weekday".
 */
function nextWeekly(
    anchor: Date,
    from: Date,
    interval: number,
    daysOfWeek?: number[],
): Date {
    const days = (daysOfWeek && daysOfWeek.length > 0)
        ? Array.from(new Set(daysOfWeek)).filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
        : [anchor.getUTCDay()];

    // Scan forward a day at a time from the day after `from`, honoring the
    // week-interval relative to the anchor's week. Bounded scan (<= ~maxWeeks).
    const maxDays = 7 * 53 * Math.max(interval, 1); // generous upper bound
    const anchorWeekStart = startOfUtcWeek(anchor);

    let candidate = addUtcDays(from, 1);
    candidate.setUTCHours(
        anchor.getUTCHours(),
        anchor.getUTCMinutes(),
        anchor.getUTCSeconds(),
        anchor.getUTCMilliseconds(),
    );
    // If setting the anchor time made candidate <= from on the same day, step a day.
    if (candidate.getTime() <= from.getTime()) {
        candidate = addUtcDays(candidate, 1);
    }

    for (let i = 0; i < maxDays; i++) {
        if (days.includes(candidate.getUTCDay())) {
            const weeksFromAnchor = Math.floor(
                (startOfUtcWeek(candidate).getTime() - anchorWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000),
            );
            if (weeksFromAnchor >= 0 && weeksFromAnchor % Math.max(interval, 1) === 0) {
                return candidate;
            }
        }
        candidate = addUtcDays(candidate, 1);
    }
    // Fallback: should not be reached for sane inputs.
    return addUtcDays(anchor, 7 * Math.max(interval, 1));
}

/** UTC start-of-week (Sunday 00:00) for week-interval math. */
function startOfUtcWeek(d: Date): Date {
    const s = cloneDate(d);
    s.setUTCDate(s.getUTCDate() - s.getUTCDay());
    s.setUTCHours(0, 0, 0, 0);
    return s;
}

/**
 * Monthly recurrence: next is `interval` months after the current month, on
 * `dayOfMonth` (or the anchor's day), clamped to the target month's length.
 */
function nextMonthly(
    anchor: Date,
    from: Date,
    interval: number,
    dayOfMonth?: number,
): Date {
    const targetDay = (dayOfMonth && dayOfMonth >= 1 && dayOfMonth <= 31)
        ? dayOfMonth
        : anchor.getUTCDate();

    const step = Math.max(interval, 1);

    // Build candidate in the anchor's month first, then advance by `step`
    // months until strictly after `from`.
    const build = (year: number, monthIndex: number): Date => {
        const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
        const day = Math.min(targetDay, daysInMonth);
        return new Date(Date.UTC(
            year,
            monthIndex,
            day,
            anchor.getUTCHours(),
            anchor.getUTCMinutes(),
            anchor.getUTCSeconds(),
            anchor.getUTCMilliseconds(),
        ));
    };

    let year = anchor.getUTCFullYear();
    let month = anchor.getUTCMonth();
    let candidate = build(year, month);

    while (candidate.getTime() <= from.getTime()) {
        month += step;
        year += Math.floor(month / 12);
        month = ((month % 12) + 12) % 12;
        candidate = build(year, month);
    }
    return candidate;
}

/**
 * Compute the next fire time strictly after `from` for the given recurrence
 * rule. Returns null when the next occurrence would fall past `endDate`.
 *
 * `from` doubles as the anchor (time-of-day + base date) for the series — pass
 * the just-published post's `scheduledFor` to get the following occurrence.
 * All math is UTC; no timezone conversion is applied.
 */
export function computeNextOccurrence(recurrence: IRecurrence, from: Date): Date | null {
    if (!recurrence || !recurrence.frequency) return null;

    const anchor = cloneDate(from);
    const interval = Math.max(recurrence.interval || 1, 1);

    let next: Date;
    switch (recurrence.frequency) {
        case 'daily':
            next = nextDaily(anchor, from, interval);
            break;
        case 'weekly':
            next = nextWeekly(anchor, from, interval, recurrence.daysOfWeek);
            break;
        case 'monthly':
            next = nextMonthly(anchor, from, interval, recurrence.dayOfMonth);
            break;
        default:
            return null;
    }

    if (isPastEndDate(recurrence, next)) return null;
    return next;
}

/**
 * Return up to `count` upcoming occurrences starting strictly after `start`,
 * for calendar preview. Stops early at `endDate`.
 */
export function expandRecurrencePreview(
    recurrence: IRecurrence,
    start: Date,
    count: number,
): Date[] {
    const out: Date[] = [];
    if (!recurrence || count <= 0) return out;

    let cursor = cloneDate(start);
    for (let i = 0; i < count; i++) {
        const next = computeNextOccurrence(recurrence, cursor);
        if (!next) break;
        out.push(next);
        cursor = next;
    }
    return out;
}

/**
 * Fields used to materialize the next occurrence of a recurring post. Mirrors
 * the source post's content/platforms/media, advances `scheduledFor`, links the
 * series via `parentPostId`, and resets status to 'scheduled'.
 */
export interface MaterializedRecurrence {
    fields: CreateScheduledPostInput & { parentPostId: string; recurrence: IRecurrence };
    nextOccurrence: Date;
}

/**
 * Given a just-published recurring post, persist the NEXT occurrence and return
 * the created document (or null when the series has ended / has no recurrence).
 *
 * This does NOT enqueue the BullMQ job — the worker wiring that calls this is
 * handled separately. It only builds + creates the next scheduled-post row so
 * the series stays alive on the calendar and in `findDueForPublishing`.
 */
export async function materializeNextRecurrence(
    post: Pick<
        IScheduledPost,
        'recurrence' | 'scheduledFor' | 'content' | 'mediaUrls' | 'mediaTypes' | 'altText' | 'postFormat' | 'platforms' | 'timezone' | 'brandId' | 'userId' | 'parentPostId'
    > & { _id?: unknown },
): Promise<IScheduledPost | null> {
    if (!post.recurrence) return null;

    const recurrence = post.recurrence as IRecurrence;
    const nextOccurrence = computeNextOccurrence(recurrence, new Date(post.scheduledFor));
    if (!nextOccurrence) return null;

    // The series root: original parent if this post is already a child,
    // otherwise this post's own id (it is the first in the series).
    const parentPostId = post.parentPostId || (post._id != null ? String(post._id) : undefined);
    if (!parentPostId) return null;

    const { scheduledPostRepository } = await import('@/lib/db/repository/scheduled-post.repository');

    const created = await scheduledPostRepository.create({
        brandId: post.brandId,
        userId: post.userId,
        status: 'scheduled',
        content: post.content,
        mediaUrls: [...(post.mediaUrls || [])],
        mediaTypes: [...(post.mediaTypes || [])],
        altText: post.altText,
        postFormat: post.postFormat,
        platforms: (post.platforms || []).map((p) => ({ ...p })) as IPlatformConfig[],
        scheduledFor: nextOccurrence,
        timezone: post.timezone,
        recurrence: {
            frequency: recurrence.frequency,
            interval: recurrence.interval,
            endDate: recurrence.endDate,
            daysOfWeek: recurrence.daysOfWeek,
            dayOfMonth: recurrence.dayOfMonth,
        },
    });

    // Link the new occurrence into the series. `create` doesn't accept
    // parentPostId in its input shape, so set it directly.
    (created as unknown as { parentPostId: string }).parentPostId = parentPostId;
    await created.save();

    return created;
}
