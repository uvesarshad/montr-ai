/**
 * Marketing benchmark reference bands.
 *
 * Pure, dependency-free constant module of realistic min/max ranges for common
 * marketing metrics. Used to (a) sanity-check / flag numbers that come back from
 * strategy generation and (b) inject realistic ranges into LLM prompts so the
 * model proposes grounded targets.
 *
 * NOTE: these are STARTING GUESSES — tune to our data as real performance
 * lands. Bands are India-flavored where relevant (e.g. high WhatsApp read
 * rates, broad email open ranges reflecting Indian SMB sending habits).
 */

export type BenchmarkUnit = 'percent' | 'perWeek';

export interface BenchmarkBand {
  /** lower bound (inclusive). For 'percent', a value like 8 means 8%. */
  min: number;
  /** upper bound (inclusive). */
  max: number;
  unit: BenchmarkUnit;
  /** human label for prompt + flag messages, e.g. "Email open rate". */
  label: string;
  /** optional caveat shown in prompts. */
  note?: string;
}

/** Keyed by a stable metric id. tune to our data. */
export const BENCHMARK_BANDS: Record<string, BenchmarkBand> = {
  emailOpenRate: { min: 8, max: 45, unit: 'percent', label: 'Email open rate' },
  emailClickRate: { min: 0.5, max: 8, unit: 'percent', label: 'Email click rate' },
  emailToOrderConversion: { min: 0.1, max: 6, unit: 'percent', label: 'Email→order conversion' },
  whatsappReadRate: {
    min: 30,
    max: 95,
    unit: 'percent',
    label: 'WhatsApp campaign read rate',
    note: 'Read rates run high in India; opted-in lists skew toward the top of the band.',
  },
  whatsappCtr: { min: 1, max: 25, unit: 'percent', label: 'WhatsApp CTR' },
  igEngagementRate: { min: 0.3, max: 8, unit: 'percent', label: 'Organic IG engagement rate' },
  metaPaidCtr: { min: 0.4, max: 4, unit: 'percent', label: 'Paid CTR (Meta)' },
  ecomCvr: { min: 0.3, max: 5, unit: 'percent', label: 'Website conversion rate (ecom)' },
  postsPerWeek: { min: 1, max: 21, unit: 'perWeek', label: 'Posts/week per channel' },
  emailsPerWeek: { min: 1, max: 7, unit: 'perWeek', label: 'Emails/week' },
  whatsappPerWeek: { min: 1, max: 5, unit: 'perWeek', label: 'WhatsApp broadcasts/week' },

  // ─── Social benchmark bands (Epic 7.2) ──────────────────────────────────
  // Per-platform organic engagement-rate ranges (% of audience that interacts
  // with a post), plus cross-channel cadence + follower-growth bands. Default
  // bands here; per-industry overrides live in `SOCIAL_INDUSTRY_BANDS` below.
  // Engagement-rate ranges are STARTING GUESSES drawn from public 2024–25
  // social benchmark reports — tune to our own data as it lands.
  'social.instagram.engagementRate': { min: 0.5, max: 6, unit: 'percent', label: 'Instagram engagement rate' },
  'social.x.engagementRate': { min: 0.2, max: 2, unit: 'percent', label: 'X (Twitter) engagement rate' },
  'social.linkedin.engagementRate': { min: 1, max: 5, unit: 'percent', label: 'LinkedIn engagement rate' },
  'social.facebook.engagementRate': { min: 0.2, max: 3, unit: 'percent', label: 'Facebook engagement rate' },
  'social.tiktok.engagementRate': { min: 2.5, max: 12, unit: 'percent', label: 'TikTok engagement rate' },
  'social.youtube.engagementRate': { min: 1, max: 8, unit: 'percent', label: 'YouTube engagement rate' },
  'social.postsPerWeek': { min: 3, max: 14, unit: 'perWeek', label: 'Social posts/week per channel' },
  'social.followerGrowthRate': { min: 0.5, max: 8, unit: 'percent', label: 'Monthly follower growth rate' },
};

/**
 * Industry verticals the social benchmark picker exposes. Each maps to an
 * optional override table in `SOCIAL_INDUSTRY_BANDS`; verticals without an entry
 * for a given metric fall back to the default band in `BENCHMARK_BANDS`.
 */
export const SOCIAL_INDUSTRIES = [
  { value: 'ecommerce', label: 'E-commerce / Retail' },
  { value: 'saas', label: 'SaaS / Technology' },
  { value: 'agency', label: 'Agency / Services' },
  { value: 'media', label: 'Media / Publishing' },
  { value: 'nonprofit', label: 'Nonprofit' },
  { value: 'local_services', label: 'Local services' },
  { value: 'other', label: 'Other' },
] as const;

export type SocialIndustry = (typeof SOCIAL_INDUSTRIES)[number]['value'];

/**
 * Per-industry overrides for benchmark bands. Keyed by industry → metric id →
 * band. Only the metrics that meaningfully differ from the default are listed;
 * anything absent falls through to `BENCHMARK_BANDS`. These are deliberately
 * coarse starting points (e.g. media/nonprofit see higher organic engagement,
 * e-commerce posts more often, SaaS engagement skews lower on LinkedIn-heavy
 * audiences). Tune as real per-vertical data accumulates.
 */
export const SOCIAL_INDUSTRY_BANDS: Record<string, Record<string, BenchmarkBand>> = {
  ecommerce: {
    'social.instagram.engagementRate': { min: 0.8, max: 5, unit: 'percent', label: 'Instagram engagement rate (e-commerce)' },
    'social.facebook.engagementRate': { min: 0.3, max: 2.5, unit: 'percent', label: 'Facebook engagement rate (e-commerce)' },
    'social.postsPerWeek': { min: 5, max: 21, unit: 'perWeek', label: 'Social posts/week (e-commerce)' },
  },
  saas: {
    'social.linkedin.engagementRate': { min: 1.5, max: 6, unit: 'percent', label: 'LinkedIn engagement rate (SaaS)' },
    'social.x.engagementRate': { min: 0.3, max: 2.5, unit: 'percent', label: 'X engagement rate (SaaS)' },
    'social.postsPerWeek': { min: 3, max: 10, unit: 'perWeek', label: 'Social posts/week (SaaS)' },
  },
  agency: {
    'social.linkedin.engagementRate': { min: 1.5, max: 7, unit: 'percent', label: 'LinkedIn engagement rate (agency)' },
    'social.instagram.engagementRate': { min: 0.8, max: 7, unit: 'percent', label: 'Instagram engagement rate (agency)' },
  },
  media: {
    'social.instagram.engagementRate': { min: 1, max: 9, unit: 'percent', label: 'Instagram engagement rate (media)' },
    'social.x.engagementRate': { min: 0.4, max: 3, unit: 'percent', label: 'X engagement rate (media)' },
    'social.facebook.engagementRate': { min: 0.4, max: 4, unit: 'percent', label: 'Facebook engagement rate (media)' },
    'social.postsPerWeek': { min: 7, max: 35, unit: 'perWeek', label: 'Social posts/week (media)' },
  },
  nonprofit: {
    'social.instagram.engagementRate': { min: 1, max: 8, unit: 'percent', label: 'Instagram engagement rate (nonprofit)' },
    'social.facebook.engagementRate': { min: 0.5, max: 4.5, unit: 'percent', label: 'Facebook engagement rate (nonprofit)' },
    'social.followerGrowthRate': { min: 0.3, max: 5, unit: 'percent', label: 'Monthly follower growth (nonprofit)' },
  },
  local_services: {
    'social.instagram.engagementRate': { min: 1, max: 8, unit: 'percent', label: 'Instagram engagement rate (local)' },
    'social.facebook.engagementRate': { min: 0.5, max: 5, unit: 'percent', label: 'Facebook engagement rate (local)' },
    'social.postsPerWeek': { min: 2, max: 10, unit: 'perWeek', label: 'Social posts/week (local)' },
  },
  // 'other' intentionally has no overrides — always falls back to defaults.
};

/**
 * Look up a band by metric id.
 *
 * When `opts.industry` names a vertical with a specific override for this metric
 * (see `SOCIAL_INDUSTRY_BANDS`), that override wins; otherwise the default band
 * from `BENCHMARK_BANDS` is returned. `opts.channel` is accepted for
 * forward-compatibility and currently unused. Returns `undefined` for unknown
 * metric ids.
 */
export function getBand(
  metric: string,
  opts?: { channel?: string; industry?: string },
): BenchmarkBand | undefined {
  if (opts?.industry) {
    const override = SOCIAL_INDUSTRY_BANDS[opts.industry]?.[metric];
    if (override) return override;
  }
  return BENCHMARK_BANDS[metric];
}

/** Render a single band's range as a compact string, e.g. "8–45%" or "1–21/week". */
function formatRange(band: BenchmarkBand): string {
  const suffix = band.unit === 'percent' ? '%' : '/week';
  return `${band.min}–${band.max}${suffix}`;
}

/** Maps a channel hint (lowercased substring match) to its core metric ids. */
const CHANNEL_METRICS: Record<string, string[]> = {
  email: ['emailOpenRate', 'emailClickRate', 'emailToOrderConversion', 'emailsPerWeek'],
  whatsapp: ['whatsappReadRate', 'whatsappCtr', 'whatsappPerWeek'],
  instagram: ['igEngagementRate', 'postsPerWeek'],
  ig: ['igEngagementRate', 'postsPerWeek'],
  social: ['igEngagementRate', 'postsPerWeek'],
  meta: ['metaPaidCtr'],
  ads: ['metaPaidCtr'],
  paid: ['metaPaidCtr'],
  web: ['ecomCvr'],
  ecom: ['ecomCvr'],
  store: ['ecomCvr'],
};

/** Core cadence + rate bands shown when no channels are specified. */
const CORE_METRICS: string[] = [
  'emailOpenRate',
  'emailClickRate',
  'whatsappReadRate',
  'igEngagementRate',
  'ecomCvr',
  'postsPerWeek',
  'emailsPerWeek',
  'whatsappPerWeek',
];

/**
 * Render the relevant bands as a compact human string to inject into the
 * generation prompt, e.g. "Realistic ranges: Email open rate 8–45%; ...".
 *
 * If `channels` is passed, prefer bands relevant to those channels; otherwise
 * include the cadence + a few core rate bands.
 */
export function formatBandsForPrompt(channels?: string[]): string {
  let metricIds: string[];

  if (channels && channels.length > 0) {
    const collected = new Set<string>();
    for (const channel of channels) {
      const key = channel.toLowerCase();
      for (const [hint, ids] of Object.entries(CHANNEL_METRICS)) {
        if (key.includes(hint)) ids.forEach((id) => collected.add(id));
      }
    }
    metricIds = collected.size > 0 ? Array.from(collected) : CORE_METRICS;
  } else {
    metricIds = CORE_METRICS;
  }

  const parts = metricIds
    .map((id) => BENCHMARK_BANDS[id])
    .filter((band): band is BenchmarkBand => band !== undefined)
    .map((band) => `${band.label} ${formatRange(band)}`);

  return `Realistic ranges: ${parts.join('; ')}.`;
}
