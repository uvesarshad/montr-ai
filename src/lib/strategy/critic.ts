/**
 * Strategy critic service.
 *
 * A single LLM "critic" call that scores a candidate strategy on five explicit
 * dimensions (specificity, actionability, feasibility, goalFit, grounding) and
 * returns structured JSON. It does NOT regenerate or revise — the generator
 * owns those loops; this only scores.
 *
 * Model routing mirrors `generator.ts` (task-routed via `getPreferredModel`,
 * 'agentStrategy' task). A local robust JSON extractor is duplicated here on
 * purpose: importing `extractJson` from generator.ts would create a circular
 * import once the generator imports this critic.
 *
 * Defensive: never throws. On LLM error or unparseable output it returns a
 * safe fallback so the strategy pipeline never hard-fails.
 */

import { generateTextWithClient } from '@/ai/client';
import type { CanonicalChannel } from './connected-channels';
import type { StrategyCriticDimension } from '@/lib/db/models/strategy.model';

export interface CritiqueParams {
  userId?: string;                 // for model routing; may be undefined (pref falls back)
  strategy: Record<string, unknown>;   // the candidate strategy JSON (name, goals, channels, contentMix, cadence...)
  brandContextSummary: string;     // short brand profile text
  connectedChannels: Set<CanonicalChannel>;
  benchmarkText: string;           // output of formatBandsForPrompt(...)
  userGoal: string;                // the user's original/reformulated goal
}

export interface CritiqueResult {
  dimensions: StrategyCriticDimension[];   // { name; score 1-5; issues[]; mustFix[] }
  overall: number;    // 1-5
  summary: string;
}

const SYSTEM_PROMPT = `You are a rigorous marketing-strategy critic. Score the candidate strategy on each dimension 1-5 (5=excellent). Return ONLY valid JSON, no markdown fences, no prose outside JSON.

DIMENSION DEFINITIONS:
- specificity — are tactics concrete ("send a 3-email winback to lapsed buyers") vs vague ("improve engagement")? Penalize filler.
- actionability — could the user start Monday without clarifying questions? Are owners/cadence/first-step implied?
- feasibility — realistic for this brand's apparent size/stage/connected channels and the benchmark bands provided?
- goalFit — does the plan actually move the user's stated goal, or is it a generic plan ignoring the goal?
- grounding — are claims/numbers tied to the brand context + benchmark data provided, or invented? Penalize numbers with no basis.`;

/**
 * Robust JSON extraction. Models often wrap JSON in ```json fences or prefix
 * prose; this strips fences then falls back to the first {...} match.
 * Replicated locally (not imported from generator.ts) to avoid a circular
 * import once the generator imports this critic.
 */
function extractJson<T>(raw: string): T {
  const unfenced = raw.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim();
  try {
    return JSON.parse(unfenced) as T;
  } catch {
    const match = unfenced.match(/\{[\s\S]*\}/);
    if (!match) throw new Error(`Critic returned non-JSON output (${raw.slice(0, 120)}…)`);
    return JSON.parse(match[0]) as T;
  }
}

/** Clamp an arbitrary value to an integer-friendly number in [1, 5]. */
function clampScore(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 3;
  return Math.min(5, Math.max(1, num));
}

const FALLBACK: CritiqueResult = {
  dimensions: [],
  overall: 3,
  summary: 'Critic unavailable; proceeding without critic score.',
};

function buildUserPrompt(params: CritiqueParams): string {
  const channels = Array.from(params.connectedChannels).join(', ') || '(none connected)';
  return `USER GOAL:
${params.userGoal}

BRAND CONTEXT:
${params.brandContextSummary}

CONNECTED CHANNELS:
${channels}

BENCHMARK DATA:
${params.benchmarkText}

CANDIDATE STRATEGY (JSON):
${JSON.stringify(params.strategy, null, 2)}

Score each dimension 1-5 and return ONLY this JSON shape:
{
  "dimensions": [
    { "name": "specificity", "score": 1, "issues": ["..."], "mustFix": ["..."] },
    { "name": "actionability", "score": 1, "issues": [], "mustFix": [] },
    { "name": "feasibility", "score": 1, "issues": [], "mustFix": [] },
    { "name": "goalFit", "score": 1, "issues": [], "mustFix": [] },
    { "name": "grounding", "score": 1, "issues": [], "mustFix": [] }
  ],
  "overall": 1,
  "summary": "one or two sentences"
}`;
}

interface RawCritiqueOutput {
  dimensions?: Array<{ name?: unknown; score?: unknown; issues?: unknown; mustFix?: unknown }>;
  overall?: unknown;
  summary?: unknown;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export async function critiqueStrategy(params: CritiqueParams): Promise<CritiqueResult> {
  try {
    // Model is task-routed (same as generator.ts) — a hardcoded model breaks
    // critique whenever that one provider has no key configured.
    const { AISettingsService } = await import('@/lib/services/ai-settings.service');
    const pref = await AISettingsService.getPreferredModel(params.userId, 'agentStrategy');

    const raw = await generateTextWithClient({
      model: pref.modelId,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(params) }],
      maxTokens: 2048,
      temperature: 0.2,
      routeHint: pref.routeHint,
    });

    const parsed = extractJson<RawCritiqueOutput>(raw);

    const dimensions: StrategyCriticDimension[] = (parsed.dimensions ?? []).map((d) => ({
      name: typeof d.name === 'string' ? d.name : '',
      score: clampScore(d.score),
      issues: toStringArray(d.issues),
      mustFix: toStringArray(d.mustFix),
    }));

    // overall: clamp; if missing/invalid, derive as the mean of dimension scores.
    let overall: number;
    if (parsed.overall != null && Number.isFinite(Number(parsed.overall))) {
      overall = clampScore(parsed.overall);
    } else if (dimensions.length > 0) {
      const mean = dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length;
      overall = clampScore(mean);
    } else {
      overall = 3;
    }

    const summary = typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : 'No summary provided.';

    return { dimensions, overall, summary };
  } catch (err) {
    console.error('[strategy-critic] failed:', err);
    return FALLBACK;
  }
}
