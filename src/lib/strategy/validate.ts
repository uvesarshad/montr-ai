/**
 * Deterministic strategy validation (code only — no LLM).
 *
 * Runs immediately after JSON extraction from the generation call and BEFORE
 * persist. Takes the raw parsed object (unknown shape), structurally validates
 * it with Zod, then runs a series of grounding / measurability / sanity checks
 * (C1–C6) against the brand's connected channels + benchmark bands.
 *
 * Pure + defensive: never throws. Malformed input yields issues, not exceptions.
 */

import { z } from 'zod';
import type {
  StrategyValidationIssue,
  StrategyValidationStatus,
} from '@/lib/db/models/strategy.model';
import type { CanonicalChannel } from './connected-channels';
import { normalizeChannel } from './connected-channels';
import { getBand } from './benchmarks';

export type ValidationIssue = StrategyValidationIssue;
export type ValidationStatus = StrategyValidationStatus;

export interface ValidateContext {
  connectedChannels: Set<CanonicalChannel>;
  userGoal: string;
  industry?: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  status: ValidationStatus;
}

/** Canonical social-channel set used for cadence/contentMix grounding heuristics. */
const SOCIAL_CHANNELS: ReadonlySet<CanonicalChannel> = new Set<CanonicalChannel>([
  'instagram', 'facebook', 'x', 'linkedin', 'youtube', 'tiktok',
  'google_business', 'bluesky', 'mastodon', 'threads', 'reddit',
  'pinterest', 'telegram',
]);

const PLACEHOLDER_TOKENS = ['tbd', 'lorem', '<insert', 'todo', 'xxx'];
const VAGUE_KPIS = ['engagement', 'awareness', 'growth', 'presence', 'more', 'improve'];

/** Zod schema mirroring the JSON the generation LLM emits. */
const strategyShapeSchema = z.object({
  name: z.string(),
  description: z.string(),
  goals: z
    .array(
      z.object({
        kpi: z.string(),
        target: z.union([z.string(), z.number()]),
        deadline: z.union([z.string(), z.date()]),
      }),
    )
    .min(1),
  channels: z.array(z.string()).min(1),
  contentMix: z.record(z.number()),
  cadence: z
    .object({
      postsPerWeek: z.number().optional(),
      emailsPerWeek: z.number().optional(),
      callsPerWeek: z.number().optional(),
      whatsappPerWeek: z.number().optional(),
    })
    .partial(),
});

type StrategyShape = z.infer<typeof strategyShapeSchema>;

function containsPlaceholder(text: string): boolean {
  const lower = text.toLowerCase();
  return PLACEHOLDER_TOKENS.some((token) => lower.includes(token));
}

/** Date parses to a valid instant strictly after Date.now(). */
function isFutureDate(raw: string | Date): boolean {
  const date = raw instanceof Date ? raw : new Date(raw);
  const time = date.getTime();
  return Number.isFinite(time) && time > Date.now();
}

/** Extract the first percentage figure (e.g. "40%") from a string, or null. */
function extractPercent(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Validate a raw parsed strategy object (unknown shape from JSON extraction).
 */
export function validateStrategy(parsed: unknown, ctx: ValidateContext): ValidationResult {
  const issues: ValidationIssue[] = [];
  const push = (id: string, severity: 'error' | 'warn', message: string, field?: string) => {
    issues.push({ id, severity, message, field });
  };

  const result = strategyShapeSchema.safeParse(parsed);

  // C1 — Schema completeness. On structural failure push errors and continue
  // defensively with whatever partial data is available.
  let strategy: StrategyShape | null = null;
  if (result.success) {
    strategy = result.data;
  } else {
    for (const err of result.error.errors) {
      push('C1.schema', 'error', err.message || 'Invalid strategy shape', err.path.join('.'));
    }
  }

  // Pull best-effort views of each field for checks that can run on partial data.
  const src = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const name = strategy?.name ?? (typeof src.name === 'string' ? src.name : '');
  const description =
    strategy?.description ?? (typeof src.description === 'string' ? src.description : '');
  const channels: string[] = strategy?.channels ?? (Array.isArray(src.channels)
    ? (src.channels as unknown[]).filter((c): c is string => typeof c === 'string')
    : []);
  const goals = strategy?.goals ?? [];
  const contentMix: Record<string, number> = strategy?.contentMix ?? {};
  const cadence = strategy?.cadence ?? {};

  // C1 content-level checks (run regardless of full parse success).
  if (!name.trim()) push('C1.name', 'error', 'Strategy name is empty', 'name');
  else if (containsPlaceholder(name))
    push('C1.name', 'error', 'Strategy name contains placeholder text', 'name');

  if (!description.trim())
    push('C1.description', 'error', 'Strategy description is empty', 'description');
  else if (containsPlaceholder(description))
    push('C1.description', 'error', 'Strategy description contains placeholder text', 'description');

  if (goals.length < 1) push('C1.goals', 'error', 'Strategy has no goals', 'goals');
  if (channels.length < 1) push('C1.channels', 'error', 'Strategy has no channels', 'channels');

  // C2 — Channel subset + cadence consistency.
  if (ctx.connectedChannels.size === 0) {
    push(
      'C2.unprovisioned',
      'warn',
      'no connected channels found — cannot verify channel grounding',
      'channels',
    );
  } else {
    for (const entry of channels) {
      const canonical = normalizeChannel(entry);
      if (canonical === null || !ctx.connectedChannels.has(canonical)) {
        push('C2.channel', 'error', `Channel '${entry}' is not connected for this brand`, 'channels');
      }
    }

    const hasSocial = Array.from(ctx.connectedChannels).some((c) => SOCIAL_CHANNELS.has(c));
    if ((cadence.whatsappPerWeek ?? 0) > 0 && !ctx.connectedChannels.has('whatsapp')) {
      push('C2.cadence.whatsapp', 'error', 'WhatsApp cadence set but WhatsApp is not connected', 'cadence.whatsappPerWeek');
    }
    if ((cadence.emailsPerWeek ?? 0) > 0 && !ctx.connectedChannels.has('email')) {
      push('C2.cadence.email', 'error', 'Email cadence set but email is not connected', 'cadence.emailsPerWeek');
    }
    if ((cadence.callsPerWeek ?? 0) > 0 && !ctx.connectedChannels.has('voice')) {
      push('C2.cadence.voice', 'error', 'Call cadence set but voice is not connected', 'cadence.callsPerWeek');
    }
    if ((cadence.postsPerWeek ?? 0) > 0 && !hasSocial) {
      push('C2.cadence.social', 'error', 'Posting cadence set but no social channel is connected', 'cadence.postsPerWeek');
    }
  }

  // C3 — Goal measurability.
  goals.forEach((goal, idx) => {
    const field = `goals[${idx}]`;
    const kpi = (goal.kpi ?? '').trim();
    const kpiLower = kpi.toLowerCase();
    if (!kpi || VAGUE_KPIS.includes(kpiLower)) {
      push('C3.kpi', 'error', `Goal ${idx + 1} has a vague or empty KPI`, `${field}.kpi`);
    }
    const targetStr = String(goal.target ?? '');
    if (!/\d/.test(targetStr)) {
      push('C3.target', 'error', `Goal ${idx + 1} target is not measurable (no numeric value)`, `${field}.target`);
    }
    if (!isFutureDate(goal.deadline)) {
      push('C3.deadline', 'error', `Goal ${idx + 1} deadline is missing, invalid, or not in the future`, `${field}.deadline`);
    }
  });

  // C4 — Numeric sanity for cadence (out-of-band → error; within 10% of edge → warn).
  const cadenceMetrics: Array<[keyof typeof cadence, string]> = [
    ['postsPerWeek', 'postsPerWeek'],
    ['emailsPerWeek', 'emailsPerWeek'],
    ['whatsappPerWeek', 'whatsappPerWeek'],
  ];
  for (const [key, metric] of cadenceMetrics) {
    const value = cadence[key];
    if (typeof value !== 'number' || value <= 0) continue;
    const band = getBand(metric);
    if (!band) continue;
    if (value < band.min || value > band.max) {
      push('C4.cadence', 'error', `${band.label} value ${value} is outside the realistic range ${band.min}–${band.max}`, `cadence.${key}`);
    } else {
      const span = band.max - band.min;
      const edge = span * 0.1;
      if (value - band.min <= edge || band.max - value <= edge) {
        push('C4.cadence', 'warn', `${band.label} value ${value} is near the edge of the realistic range ${band.min}–${band.max}`, `cadence.${key}`);
      }
    }
  }

  // C4 — Goal-target percentages vs known metric bands (heuristic).
  goals.forEach((goal, idx) => {
    const targetStr = String(goal.target ?? '');
    const percent = extractPercent(targetStr);
    if (percent === null) return;
    const kpiText = (goal.kpi ?? '').toLowerCase();
    let metric: string | null = null;
    if (kpiText.includes('open')) metric = 'emailOpenRate';
    else if (kpiText.includes('click') || kpiText.includes('ctr')) metric = 'emailClickRate';
    else if (kpiText.includes('conversion') || kpiText.includes('convert')) metric = 'emailToOrderConversion';
    else if (kpiText.includes('read')) metric = 'whatsappReadRate';
    if (!metric) return;
    const band = getBand(metric);
    if (!band || band.unit !== 'percent') return;
    if (percent < band.min || percent > band.max) {
      push('C4.target', 'error', `Goal ${idx + 1} target ${percent}% is outside the realistic ${band.label} range ${band.min}–${band.max}%`, `goals[${idx}].target`);
    }
  });

  // C5 — Internal consistency.
  const mixFormats = Object.keys(contentMix);
  if (mixFormats.length > 0) {
    const sum = Object.values(contentMix).reduce((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
    if (Math.abs(sum - 100) > 2) {
      push('C5.contentMix', 'error', `Content mix percentages sum to ${sum}, expected ~100`, 'contentMix');
    }
  }
  for (const [key, value] of Object.entries(cadence)) {
    if (typeof value !== 'number') continue;
    if (value < 0 || !Number.isInteger(value)) {
      push('C5.cadence', 'error', `Cadence ${key} must be a non-negative integer (got ${value})`, `cadence.${key}`);
    }
  }
  // contentMix formats implying a channel not present (heuristic warn).
  const normalizedChannels = new Set(
    channels.map((c) => normalizeChannel(c)).filter((c): c is CanonicalChannel => c !== null),
  );
  const videoChannels: CanonicalChannel[] = ['instagram', 'youtube', 'tiktok', 'facebook'];
  const hasVideoChannel = videoChannels.some((c) => normalizedChannels.has(c));
  for (const format of mixFormats) {
    const f = format.toLowerCase();
    if ((f.includes('reel') || f.includes('video')) && !hasVideoChannel) {
      push('C5.contentMix.channel', 'warn', `Content mix includes '${format}' but no video-capable channel is selected`, 'contentMix');
    }
  }

  // C6 — Goal-fit heuristic (single warn).
  const goalLower = ctx.userGoal.toLowerCase();
  const salesIntent = /\b(sales|revenue|orders?|sell|purchase)\b/.test(goalLower);
  if (salesIntent) {
    const hasSalesGoal = goals.some((g) => {
      const text = `${g.kpi ?? ''} ${String(g.target ?? '')}`.toLowerCase();
      return /\b(revenue|orders?|sales?|conversion|purchase)\b/.test(text);
    });
    if (!hasSalesGoal) {
      push('C6.goalFit', 'warn', 'no goal KPI targets the stated sales objective', 'goals');
    }
  }

  // Status derivation.
  const hasError = issues.some((i) => i.severity === 'error');
  const hasWarn = issues.some((i) => i.severity === 'warn');
  const status: ValidationStatus = hasError
    ? 'failed'
    : hasWarn
      ? 'passed_with_warnings'
      : 'passed';

  return { issues, status };
}
