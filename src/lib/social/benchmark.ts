/**
 * Social competitor / industry-benchmark builder (Epic 7.2).
 *
 * Computes a brand's own per-platform engagement rate + posting cadence over a
 * date range, then compares each metric against an industry baseline band from
 * `src/lib/strategy/benchmarks.ts`. Returns comparison cards the analytics UI
 * renders as "you vs the industry" rows.
 *
 * Pure read path: it reuses the same PostAnalytics aggregates the analytics
 * route already serves (`analyticsRepository.getPlatformComparison` /
 * `getSummary`) and the shared `analytics-insights` helpers — nothing is
 * recomputed from raw documents here. Caller MUST have already run
 * `assertBrandAccess` (org is passed in, never trusted from the client).
 */

import { analyticsRepository } from '@/lib/db/repository/analytics.repository';
import { buildPlatformCards } from '@/lib/social/analytics-insights';
import { getBand, type BenchmarkBand } from '@/lib/strategy/benchmarks';

/** Platforms that have an engagement-rate benchmark band. */
const BENCHMARKED_ENGAGEMENT_PLATFORMS = [
  'instagram',
  'x',
  'linkedin',
  'facebook',
  'tiktok',
  'youtube',
] as const;

export type BenchmarkStatus = 'below' | 'within' | 'above';

export interface SocialBenchmarkCard {
  /** Stable metric id (e.g. `social.instagram.engagementRate`). */
  metric: string;
  /** Platform key when the metric is platform-scoped (omitted for cadence). */
  platform?: string;
  /** Human label for the row. */
  label: string;
  /** The brand's measured value, in the band's unit (percent or perWeek). */
  brandValue: number;
  /** The industry baseline band looked up for this metric/industry. */
  band: { min: number; max: number; label: string; unit: BenchmarkBand['unit'] };
  /** Where the brand sits relative to the band. */
  status: BenchmarkStatus;
  /**
   * 0–100 hint of where in (and beyond) the band the brand value falls — used
   * to position a marker on the band meter. Clamped to [0, 100].
   */
  percentileHint: number;
}

export interface SocialBenchmarkResult {
  industry: string | null;
  cards: SocialBenchmarkCard[];
}

export interface BuildSocialBenchmarkInput {
  brandId: string;
  industry?: string | null;
  fromDate: Date;
  toDate: Date;
}

function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Classify a value against a band. */
function classify(value: number, band: BenchmarkBand): BenchmarkStatus {
  if (value < band.min) return 'below';
  if (value > band.max) return 'above';
  return 'within';
}

/**
 * Position of `value` within `[min, max]` as 0–100. Values below the band clamp
 * toward 0, above the band toward 100. A zero-width band returns 50.
 */
function percentile(value: number, band: BenchmarkBand): number {
  const span = band.max - band.min;
  if (span <= 0) return 50;
  const pct = ((value - band.min) / span) * 100;
  return Math.max(0, Math.min(100, round(pct, 1)));
}

function toCard(
  metric: string,
  brandValue: number,
  band: BenchmarkBand,
  platform?: string,
): SocialBenchmarkCard {
  return {
    metric,
    platform,
    label: band.label,
    brandValue: round(brandValue),
    band: { min: band.min, max: band.max, label: band.label, unit: band.unit },
    status: classify(brandValue, band),
    percentileHint: percentile(brandValue, band),
  };
}

/**
 * Build the benchmark comparison cards for a brand over a date range.
 *
 * - Per-platform engagement rate: from `getPlatformComparison` (avg of stored
 *   per-post `engagementRate`, already a percent). Only platforms that both have
 *   posts in range AND a benchmark band produce a card.
 * - Cadence: brand-wide posts/week derived from total posts / range weeks,
 *   compared against the `social.postsPerWeek` band.
 *
 * Industry overrides are applied per metric via `getBand(metric, { industry })`.
 */
export async function buildSocialBenchmark({
  brandId,
  industry,
  fromDate,
  toDate,
}: BuildSocialBenchmarkInput): Promise<SocialBenchmarkResult> {
  const industryKey = industry || undefined;

  const [platforms, summary] = await Promise.all([
    analyticsRepository.getPlatformComparison(brandId, fromDate, toDate),
    analyticsRepository.getSummary(brandId, fromDate, toDate),
  ]);

  const cards: SocialBenchmarkCard[] = [];

  // ── Per-platform engagement rate ──────────────────────────────────────────
  const platformCards = buildPlatformCards(platforms, summary.totalPosts);
  const benchmarked = new Set<string>(BENCHMARKED_ENGAGEMENT_PLATFORMS);

  for (const pc of platformCards) {
    if (!benchmarked.has(pc.platform)) continue;
    const metric = `social.${pc.platform}.engagementRate`;
    const band = getBand(metric, { industry: industryKey });
    if (!band) continue;
    cards.push(toCard(metric, pc.avgEngagementRate, band, pc.platform));
  }

  // ── Posting cadence (brand-wide posts/week) ───────────────────────────────
  const rangeMs = Math.max(toDate.getTime() - fromDate.getTime(), 0);
  const rangeWeeks = Math.max(rangeMs / (7 * 24 * 60 * 60 * 1000), 1 / 7); // ≥ 1 day
  const postsPerWeek = summary.totalPosts / rangeWeeks;
  const cadenceBand = getBand('social.postsPerWeek', { industry: industryKey });
  if (cadenceBand) {
    cards.push(toCard('social.postsPerWeek', postsPerWeek, cadenceBand));
  }

  return {
    industry: industry ?? null,
    cards,
  };
}
