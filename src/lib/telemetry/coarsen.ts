/**
 * Coarsen-at-source helpers for the L3 flywheel telemetry (System B).
 *
 * See docs/plan/oss-telemetry-privacy-spec-2026-06-20.md §2 + §4.
 *
 * These are PURE functions. They bucket / round / enum-map raw outcome values
 * into coarse signals **before** anything leaves the user's environment, which
 * is the anonymization method the spec relies on:
 *   - verticals collapse to a fixed coarse enum (unknown -> "other")
 *   - outcome deltas collapse to ranges, never raw percentages
 *   - horizons round to a small set of timeframe buckets
 *   - cadence collapses to low/medium/high enums
 *
 * Nothing here touches a brand name, message content, PII, a URL, or a raw
 * fingerprinting metric — those must never reach this layer in the first place.
 */

/** Coarse industry buckets (~enum; keep stable, append-only). */
export const INDUSTRY_VERTICALS = [
  'dtc_skincare',
  'dtc_apparel',
  'dtc_food_bev',
  'dtc_other',
  'saas',
  'agency',
  'local_services',
  'hospitality',
  'healthcare',
  'education',
  'finance',
  'real_estate',
  'nonprofit',
  'media_creator',
  'other',
] as const;
export type IndustryVertical = (typeof INDUSTRY_VERTICALS)[number];

/** Coarse goal buckets (~enum; append-only). */
export const GOAL_TYPES = [
  'grow_followers',
  'grow_orders',
  'grow_leads',
  'grow_engagement',
  'grow_traffic',
  'retention',
  'awareness',
  'other',
] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

/** Channels we recognise. Anything else is dropped (not coerced). */
export const TELEMETRY_CHANNELS = [
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'linkedin',
  'x',
  'threads',
  'email',
  'whatsapp',
  'sms',
  'web',
  'google',
] as const;
export type TelemetryChannel = (typeof TELEMETRY_CHANNELS)[number];

export type DeltaBucket =
  | 'down'
  | 'flat'
  | '+0-10%'
  | '+10-25%'
  | '+25-50%'
  | '+50-100%'
  | '+100%+';

export type CadenceBucket = 'low' | 'medium' | 'high' | 'very_high';

/** Timeframe buckets, in days. Raw horizons snap to the nearest of these. */
const HORIZON_BUCKETS = [7, 14, 30, 60, 90, 180, 365] as const;

/**
 * Map a free-ish vertical string to the coarse enum. Unknown -> "other".
 * Case/spacing insensitive; never echoes the raw input back.
 */
export function coarsenVertical(raw: string | undefined | null): IndustryVertical {
  if (!raw) return 'other';
  const norm = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (INDUSTRY_VERTICALS as readonly string[]).includes(norm)
    ? (norm as IndustryVertical)
    : 'other';
}

/** Map a goal string to the coarse enum. Unknown -> "other". */
export function coarsenGoal(raw: string | undefined | null): GoalType {
  if (!raw) return 'other';
  const norm = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return (GOAL_TYPES as readonly string[]).includes(norm)
    ? (norm as GoalType)
    : 'other';
}

/**
 * Filter an arbitrary channel list down to the recognised enum, de-duplicated
 * and sorted (stable shape ⇒ better k-anonymity cell grouping). Unknown
 * channels are DROPPED, never passed through.
 */
export function coarsenChannels(raw: readonly string[] | undefined | null): TelemetryChannel[] {
  if (!Array.isArray(raw)) return [];
  const allow = new Set<string>(TELEMETRY_CHANNELS as readonly string[]);
  const out = new Set<TelemetryChannel>();
  for (const c of raw) {
    const norm = String(c).trim().toLowerCase();
    if (allow.has(norm)) out.add(norm as TelemetryChannel);
  }
  return Array.from(out).sort();
}

/**
 * Bucket a raw percentage delta (e.g. +18.4 ⇒ "+10-25%"). Raw values never
 * leave the environment — only the range does.
 */
export function bucketDelta(percent: number | undefined | null): DeltaBucket {
  const p = typeof percent === 'number' && Number.isFinite(percent) ? percent : 0;
  if (p < 0) return 'down';
  if (p === 0) return 'flat';
  if (p < 10) return '+0-10%';
  if (p < 25) return '+10-25%';
  if (p < 50) return '+25-50%';
  if (p < 100) return '+50-100%';
  return '+100%+';
}

/** Snap a raw horizon (days) to the nearest fixed timeframe bucket. */
export function bucketHorizon(days: number | undefined | null): number {
  const d = typeof days === 'number' && Number.isFinite(days) ? days : 0;
  let best: number = HORIZON_BUCKETS[0];
  let bestDist = Math.abs(d - best);
  for (const b of HORIZON_BUCKETS) {
    const dist = Math.abs(d - b);
    if (dist < bestDist) {
      best = b;
      bestDist = dist;
    }
  }
  return best;
}

/** Collapse a posts-per-week cadence to a coarse enum. */
export function bucketCadence(perWeek: number | undefined | null): CadenceBucket {
  const n = typeof perWeek === 'number' && Number.isFinite(perWeek) ? perWeek : 0;
  if (n <= 1) return 'low';
  if (n <= 4) return 'medium';
  if (n <= 7) return 'high';
  return 'very_high';
}
