/**
 * Schedule visibility helpers (TODO 2.17).
 *
 * Computes the *next* fire time of a scheduled / polling workflow from its
 * trigger config, plus an estimate of the schedule interval (used for the
 * "missed-tick" / stalled heuristic). We deliberately avoid adding a cron
 * dependency: the schedule trigger only emits a small, well-known set of 5-field
 * cron patterns (see PRESET_SCHEDULES in schedule-trigger-node.tsx) plus
 * interval-style configs, so a focused evaluator covers every real config.
 *
 * Pure, side-effect free — safe to call from API routes per workflow.
 */

export interface ScheduleInfo {
    /** ISO timestamp of the next expected fire, or null if not derivable. */
    nextRunAt: string | null;
    /** Approximate interval between fires, in ms (for the stalled heuristic). */
    intervalMs: number | null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Parse a single cron field into the set of allowed numeric values. */
function parseCronField(field: string, min: number, max: number): number[] | null {
    if (field === '*') {
        const out: number[] = [];
        for (let i = min; i <= max; i++) out.push(i);
        return out;
    }
    // Step over wildcard: "*/5"
    const stepWildcard = /^\*\/(\d+)$/.exec(field);
    if (stepWildcard) {
        const step = Number(stepWildcard[1]);
        if (!step) return null;
        const out: number[] = [];
        for (let i = min; i <= max; i += step) out.push(i);
        return out;
    }
    // Comma list and/or ranges: "1,2,5" or "1-5"
    const out = new Set<number>();
    for (const part of field.split(',')) {
        const range = /^(\d+)-(\d+)$/.exec(part);
        if (range) {
            const a = Number(range[1]);
            const b = Number(range[2]);
            if (a < min || b > max || a > b) return null;
            for (let i = a; i <= b; i++) out.add(i);
            continue;
        }
        const single = /^(\d+)$/.exec(part);
        if (!single) return null;
        const v = Number(single[1]);
        if (v < min || v > max) return null;
        out.add(v);
    }
    return out.size ? Array.from(out).sort((a, b) => a - b) : null;
}

/**
 * Compute the next fire time of a standard 5-field cron expression
 * (minute hour day-of-month month day-of-week), in UTC, after `from`.
 * Returns null if the expression can't be parsed or no match is found within
 * a one-year search window.
 */
export function nextCronRun(expression: string, from: Date = new Date()): Date | null {
    const fields = expression.trim().split(/\s+/);
    if (fields.length !== 5) return null;

    const minutes = parseCronField(fields[0], 0, 59);
    const hours = parseCronField(fields[1], 0, 23);
    const doms = parseCronField(fields[2], 1, 31);
    const months = parseCronField(fields[3], 1, 12);
    // Cron day-of-week: 0-6 (Sunday=0). Allow 7 as Sunday too.
    let dows = parseCronField(fields[4].replace(/7/g, '0'), 0, 6);
    if (!minutes || !hours || !doms || !months || !dows) return null;
    dows = Array.from(new Set(dows));

    const domRestricted = fields[2] !== '*';
    const dowRestricted = fields[4] !== '*';

    // Start at the next whole minute after `from`.
    const cursor = new Date(from.getTime());
    cursor.setUTCSeconds(0, 0);
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

    const limit = from.getTime() + 366 * DAY;
    while (cursor.getTime() <= limit) {
        const month = cursor.getUTCMonth() + 1;
        if (!months.includes(month)) {
            // Jump to the first of the next month.
            cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
            cursor.setUTCHours(0, 0, 0, 0);
            continue;
        }
        const dom = cursor.getUTCDate();
        const dow = cursor.getUTCDay();
        // Standard cron OR semantics: when both DOM and DOW are restricted, a
        // match on EITHER qualifies; otherwise honor whichever is restricted.
        let dayMatches: boolean;
        if (domRestricted && dowRestricted) {
            dayMatches = doms.includes(dom) || dows.includes(dow);
        } else if (domRestricted) {
            dayMatches = doms.includes(dom);
        } else if (dowRestricted) {
            dayMatches = dows.includes(dow);
        } else {
            dayMatches = true;
        }
        if (!dayMatches) {
            cursor.setUTCDate(cursor.getUTCDate() + 1);
            cursor.setUTCHours(0, 0, 0, 0);
            continue;
        }
        if (!hours.includes(cursor.getUTCHours())) {
            cursor.setUTCHours(cursor.getUTCHours() + 1, 0, 0, 0);
            continue;
        }
        if (!minutes.includes(cursor.getUTCMinutes())) {
            cursor.setUTCMinutes(cursor.getUTCMinutes() + 1, 0, 0);
            continue;
        }
        return new Date(cursor.getTime());
    }
    return null;
}

/** Rough interval estimate for a cron expression, used by the stalled heuristic. */
function estimateCronInterval(expression: string): number | null {
    const a = nextCronRun(expression, new Date());
    if (!a) return null;
    const b = nextCronRun(expression, new Date(a.getTime() + MINUTE));
    if (!b) return null;
    return Math.max(b.getTime() - a.getTime(), MINUTE);
}

function intervalUnitMs(unit?: string): number {
    switch (unit) {
        case 'minutes':
            return MINUTE;
        case 'hours':
            return HOUR;
        case 'days':
            return DAY;
        case 'weeks':
            return WEEK;
        default:
            return HOUR;
    }
}

/**
 * Derive schedule info (next run + interval) from a scheduled-trigger config.
 * Handles both cron-style (`cronExpression`) and interval-style
 * (`scheduleType: 'interval'` with `interval` + `intervalUnit`) configs.
 *
 * For interval schedules, the next run is computed relative to `lastRunAt` when
 * available (interval after the last fire), else `interval` from now.
 */
export function deriveScheduleInfo(
    config: { cronExpression?: string; scheduleType?: string; interval?: number; intervalUnit?: string } | undefined,
    lastRunAt: Date | null,
    now: Date = new Date()
): ScheduleInfo {
    if (!config) return { nextRunAt: null, intervalMs: null };

    // Interval-style schedule.
    if (config.scheduleType === 'interval' && config.interval && config.interval > 0) {
        const intervalMs = Math.max(config.interval * intervalUnitMs(config.intervalUnit), MINUTE);
        let next = (lastRunAt ? lastRunAt.getTime() : now.getTime()) + intervalMs;
        // If the computed next run is already in the past (missed ticks), roll
        // forward to the first future tick.
        if (next <= now.getTime()) {
            const missed = Math.ceil((now.getTime() - next) / intervalMs);
            next += missed * intervalMs;
        }
        return { nextRunAt: new Date(next).toISOString(), intervalMs };
    }

    // Cron-style schedule.
    const expr = config.cronExpression?.trim();
    if (expr) {
        const next = nextCronRun(expr, now);
        const intervalMs = estimateCronInterval(expr);
        return { nextRunAt: next ? next.toISOString() : null, intervalMs };
    }

    return { nextRunAt: null, intervalMs: null };
}
