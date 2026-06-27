/**
 * Delay-node schedule computation (TODO 2.30).
 *
 * The delay node historically supported only a relative duration ("wait N
 * milliseconds"). This module extends it to four modes, all of which collapse
 * into ONE absolute `resumeAt` timestamp computed at pause time:
 *
 *   - `relative`         : wait `duration` ms from now (existing behaviour).
 *   - `until_datetime`   : wait until an explicit ISO datetime ({{vars}} are
 *                          resolved by the caller before this point).
 *   - `until_weekday_time`: wait until the next occurrence of weekday (0=Sun..6=Sat)
 *                          at HH:mm in the configured timezone.
 *   - `business_hours`   : add the relative `duration`, then if the landing time
 *                          falls outside Mon–Fri within [windowStart, windowEnd]
 *                          (HH:mm), push forward to the next window start.
 *
 * `resumeAt` is the single source of truth — the engine derives the BullMQ job
 * delay from it and the sweeper re-enqueues PAUSED runs from it. This module
 * never reads/writes the DB; it is a pure function so it can be unit-tested and
 * so the engine stays surgical.
 *
 * Timezone handling: there is no `date-fns-tz` dependency, so timezone-aware
 * computation is done with `Intl.DateTimeFormat({ timeZone })` to read the
 * wall-clock fields (year/month/day/hour/minute/weekday) of an instant in the
 * target zone, plus a small offset solver to convert a desired wall-clock time
 * in that zone back to a UTC instant. Defaults to `UTC`.
 */

export type DelayMode =
  | 'relative'
  | 'until_datetime'
  | 'until_weekday_time'
  | 'business_hours';

export interface DelayConfig {
  mode?: DelayMode;
  /** Relative wait in milliseconds (relative + business_hours). */
  duration?: number;
  /** ISO datetime string for `until_datetime` ({{vars}} pre-resolved). */
  datetime?: string;
  /** Target weekday 0=Sun..6=Sat for `until_weekday_time`. */
  weekday?: number;
  /** Target time HH:mm for `until_weekday_time`. */
  time?: string;
  /** Business-hours window start HH:mm (default 09:00). */
  windowStart?: string;
  /** Business-hours window end HH:mm (default 17:00). */
  windowEnd?: string;
  /** IANA timezone string (e.g. "America/New_York"). Default "UTC". */
  timezone?: string;
}

/** Wall-clock fields of an instant as observed in a given timezone. */
interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
  /** 0=Sun .. 6=Sat */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Read the wall-clock fields of `instant` as observed in `timeZone`.
 * Uses Intl so it is correct across DST without any dependency.
 */
function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  const parts = fmt.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
  };
}

/**
 * Convert a desired wall-clock time in `timeZone` to a UTC instant.
 *
 * There is no built-in "make a Date from zoned fields" API. We approximate the
 * zone's UTC offset at the target instant by treating the desired fields as if
 * they were UTC, then correcting by the difference between that guess's actual
 * zoned rendering and the desired fields. One correction pass is exact for all
 * but the (rare) instant landing inside a DST transition gap; a second pass
 * stabilises those.
 */
function zonedWallTimeToUtc(
  fields: { year: number; month: number; day: number; hour: number; minute: number; second?: number },
  timeZone: string
): Date {
  const targetUtcMs = Date.UTC(
    fields.year,
    fields.month - 1,
    fields.day,
    fields.hour,
    fields.minute,
    fields.second ?? 0
  );

  let guess = new Date(targetUtcMs);
  for (let i = 0; i < 2; i++) {
    const parts = getZonedParts(guess, timeZone);
    const renderedUtcMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    // How far the zone's rendering of our guess is from the wall-time we want.
    const diff = targetUtcMs - renderedUtcMs;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff);
  }
  return guess;
}

/** Parse "HH:mm" → {hour, minute}; tolerant of bad input (defaults to 0). */
function parseHHmm(value: string | undefined, fallback: string): { hour: number; minute: number } {
  const raw = (value && /^\d{1,2}:\d{2}$/.test(value.trim()) ? value.trim() : fallback);
  const [h, m] = raw.split(':');
  const hour = Math.min(23, Math.max(0, Number(h) || 0));
  const minute = Math.min(59, Math.max(0, Number(m) || 0));
  return { hour, minute };
}

/** minutes-since-midnight helper. */
function toMinutes(hour: number, minute: number): number {
  return hour * 60 + minute;
}

/**
 * Compute the absolute `resumeAt` for a delay node from its config.
 *
 * @param config delay node config (already had its {{vars}} resolved upstream
 *   for string fields like `datetime`).
 * @param now    reference instant (injectable for tests; defaults to new Date()).
 * @returns the absolute instant the execution should resume at. Never returns a
 *   time in the past for the scheduled modes — those always roll to the next
 *   valid occurrence. Relative mode may return `now` for a zero duration.
 */
export function computeResumeAt(config: DelayConfig, now: Date = new Date()): Date {
  const mode: DelayMode = config.mode ?? 'relative';
  const timeZone = (config.timezone && config.timezone.trim()) || 'UTC';

  switch (mode) {
    case 'until_datetime': {
      const parsed = config.datetime ? new Date(config.datetime) : null;
      if (!parsed || isNaN(parsed.getTime())) {
        throw new Error(
          `Delay "until_datetime" requires a valid ISO datetime (got: ${String(config.datetime)})`
        );
      }
      // If the configured datetime has no timezone designator, interpret it in
      // the configured zone rather than the server's local zone.
      const hasTzDesignator = /([zZ]|[+-]\d{2}:?\d{2})$/.test(String(config.datetime).trim());
      if (hasTzDesignator) {
        return parsed;
      }
      // Re-interpret the naive wall-clock fields in the target zone.
      const m = String(config.datetime).trim().match(
        /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/
      );
      if (!m) {
        // Couldn't parse fields — fall back to the JS-parsed instant.
        return parsed;
      }
      return zonedWallTimeToUtc(
        {
          year: Number(m[1]),
          month: Number(m[2]),
          day: Number(m[3]),
          hour: Number(m[4]),
          minute: Number(m[5]),
          second: m[6] ? Number(m[6]) : 0,
        },
        timeZone
      );
    }

    case 'until_weekday_time': {
      const targetWeekday = Math.min(6, Math.max(0, Math.trunc(Number(config.weekday ?? 1))));
      const { hour, minute } = parseHHmm(config.time, '09:00');
      const nowParts = getZonedParts(now, timeZone);

      // Days until the target weekday (0..6) in the target zone.
      let dayDelta = (targetWeekday - nowParts.weekday + 7) % 7;

      // Build the candidate at the target weekday/time and roll forward if it's
      // already in the past (e.g. target is today but the time already passed).
      const buildCandidate = (deltaDays: number): Date => {
        // Advance the calendar date by deltaDays in the target zone. We add days
        // as 24h increments to `now`, then read back the zoned date so DST day
        // boundaries are respected, then set the wall-clock time.
        const advanced = new Date(now.getTime() + deltaDays * 24 * 60 * 60 * 1000);
        const ap = getZonedParts(advanced, timeZone);
        return zonedWallTimeToUtc(
          { year: ap.year, month: ap.month, day: ap.day, hour, minute, second: 0 },
          timeZone
        );
      };

      let candidate = buildCandidate(dayDelta);
      if (candidate.getTime() <= now.getTime()) {
        dayDelta += 7;
        candidate = buildCandidate(dayDelta);
      }
      return candidate;
    }

    case 'business_hours': {
      const duration = Math.max(0, Number(config.duration ?? 0));
      const start = parseHHmm(config.windowStart, '09:00');
      const end = parseHHmm(config.windowEnd, '17:00');
      const startMin = toMinutes(start.hour, start.minute);
      const endMin = toMinutes(end.hour, end.minute);

      // Landing point after the relative wait.
      let landing = new Date(now.getTime() + duration);

      // Roll forward (at most ~14 day-steps) until landing is inside a Mon–Fri
      // business window in the target zone.
      for (let i = 0; i < 14; i++) {
        const p = getZonedParts(landing, timeZone);
        const isWeekday = p.weekday >= 1 && p.weekday <= 5;
        const landMin = toMinutes(p.hour, p.minute);

        if (isWeekday && landMin >= startMin && landMin < endMin) {
          return landing; // already inside a window.
        }

        // Determine the next window start to jump to.
        if (isWeekday && landMin < startMin) {
          // Before today's window opens → today's window start.
          landing = zonedWallTimeToUtc(
            { year: p.year, month: p.month, day: p.day, hour: start.hour, minute: start.minute },
            timeZone
          );
          return landing;
        }

        // Otherwise (after today's window, or a weekend) → advance to the next
        // day's start and re-test (handles Fri-after-hours → Mon, etc.).
        const nextDay = new Date(landing.getTime() + 24 * 60 * 60 * 1000);
        const np = getZonedParts(nextDay, timeZone);
        landing = zonedWallTimeToUtc(
          { year: np.year, month: np.month, day: np.day, hour: start.hour, minute: start.minute },
          timeZone
        );
      }
      return landing;
    }

    case 'relative':
    default: {
      const duration = Math.max(0, Number(config.duration ?? 0));
      return new Date(now.getTime() + duration);
    }
  }
}
