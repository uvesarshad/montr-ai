/**
 * Strategy generation service (B1-1.2).
 *
 * Reads brand-context + brand-memory for brand voice and history, then calls
 * Claude with prompt caching on the brand-context block to produce a
 * structured Strategy artifact.
 *
 * Usage:
 *   const strategy = await generateStrategy({ orgId, brandId, goal, userId });
 *   const roadmap  = await decomposeStrategy(strategy._id.toString(), { orgId, brandId });
 */

import { generateTextWithClient } from '@/ai/client';
import { connectMongoose } from '@/lib/mongodb';
import BrandContext from '@/lib/db/models/brand-context.model';
import Brand from '@/lib/db/models/brand.model';
import { strategyRepository } from '@/lib/db/repository/strategy.repository';
import type {
  IStrategy,
  StrategyContentMix,
  StrategyCadence,
  StrategyValidation,
} from '@/lib/db/models/strategy.model';
import type { RoadmapEntry } from '@/lib/db/models/strategy-roadmap.model';
import {
  buildStrategySystemPrompt,
  buildStrategyUserPrompt,
  buildDecomposeRoadmapPrompt,
} from './prompts/generate-strategy';
import { getConnectedChannels } from './connected-channels';
import { formatBandsForPrompt } from './benchmarks';
import { validateStrategy, type ValidateContext, type ValidationResult } from './validate';
import { critiqueStrategy, type CritiqueResult } from './critic';

export interface GenerateStrategyInput {
  orgId: string;
  brandId: string;
  goal: string;
  constraints?: string;
  userId: string;
  /** If passed, used to read `iterationNotes` for the regeneration path. */
  parentStrategyId?: string;
}

interface RawStrategyOutput {
  name: string;
  description: string;
  goals: Array<{ kpi: string; target: string; deadline: string }>;
  channels: string[];
  contentMix: StrategyContentMix;
  cadence: StrategyCadence;
  rationale?: string;
}

/**
 * Robust JSON extraction for task-routed models. Gemini (and others) often
 * wrap JSON in ```json fences or prefix prose — and a too-small maxTokens
 * truncates mid-structure, so parse failures here surface as tool errors.
 */
function extractJson<T>(raw: string, shape: 'object' | 'array'): T {
  const unfenced = raw.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim();
  try {
    return JSON.parse(unfenced) as T;
  } catch {
    const pattern = shape === 'array' ? /\[[\s\S]*\]/ : /\{[\s\S]*\}/;
    const match = unfenced.match(pattern);
    if (!match) throw new Error(`Strategy model returned non-JSON output (${raw.slice(0, 120)}…)`);
    return JSON.parse(match[0]) as T;
  }
}

async function fetchBrandContext(brandId: string, orgId: string) {
  await connectMongoose();
  const [brand, ctx] = await Promise.all([
    Brand.findById(brandId).lean(),
    BrandContext.findOne({ brandId }).lean(),
  ]);
  return { brand, ctx };
}

// ─── Validation pipeline helpers ───────────────────────────────────────────

/** One task-routed strategy LLM call. Centralizes model routing so repair /
 *  revise / reformulation never hardcode a model. */
async function callStrategyModel(opts: {
  system: string;
  user: string;
  userId: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const { AISettingsService } = await import('@/lib/services/ai-settings.service');
  const pref = await AISettingsService.getPreferredModel(opts.userId, 'agentStrategy');
  return generateTextWithClient({
    model: pref.modelId,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
    maxTokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.3,
    routeHint: pref.routeHint,
  });
}

function hasError(result: ValidationResult): boolean {
  return result.issues.some((i) => i.severity === 'error');
}

function errorIssueList(result: ValidationResult): string {
  return result.issues
    .filter((i) => i.severity === 'error')
    .map((i) => `- [${i.id}] ${i.message}${i.field ? ` (field: ${i.field})` : ''}`)
    .join('\n');
}

/** qualityScore (display/sort only): critic.overall×20 base (50 if no critic),
 *  −15 per unresolved error, −4 per warn, clamped 0-100. */
function computeQualityScore(critic: CritiqueResult | undefined, result: ValidationResult): number {
  const base = critic && critic.dimensions.length > 0 ? critic.overall * 20 : 50;
  let score = base;
  for (const issue of result.issues) score -= issue.severity === 'error' ? 15 : 4;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function needsRevise(critic: CritiqueResult): boolean {
  if (critic.dimensions.length === 0) return false; // fallback / critic unavailable
  if (critic.overall < 3.5) return true;
  if (critic.dimensions.some((d) => d.score < 3)) return true;
  if (critic.dimensions.some((d) => d.mustFix.length > 0)) return true;
  return false;
}

/** Turn a prior version's validation into a "don't repeat this" prompt note. */
function buildPriorValidationNote(validation?: StrategyValidation): string | undefined {
  if (!validation) return undefined;
  const unresolved = (validation.deterministic ?? []).filter((i) => i.severity === 'error');
  const mustFix = validation.critic?.dimensions.flatMap((d) => d.mustFix) ?? [];
  if (unresolved.length === 0 && mustFix.length === 0) return undefined;
  const parts: string[] = [];
  if (unresolved.length) parts.push(`prior version failed checks: ${unresolved.map((i) => i.message).join('; ')}`);
  if (mustFix.length) parts.push(`prior critic must-fix: ${mustFix.join('; ')}`);
  return `Avoid repeating these problems from the previous version — ${parts.join(' | ')}.`;
}

function buildBrandContextSummary(
  brandName: string,
  ctx: { brandVoice?: string; targetAudience?: string; industry?: string } | null,
): string {
  return [
    `Brand: ${brandName}`,
    ctx?.industry ? `Industry: ${ctx.industry}` : '',
    ctx?.targetAudience ? `Audience: ${ctx.targetAudience}` : '',
    ctx?.brandVoice ? `Voice: ${ctx.brandVoice}` : '',
  ].filter(Boolean).join(' · ');
}

/** §8 measurability reformulation gate. Fail-open: returns the raw goal on error. */
async function reformulateGoal(opts: {
  rawGoal: string;
  brandSummary: string;
  benchmarkText: string;
  userId: string;
}): Promise<string> {
  try {
    const system =
      'You convert a vague business goal into ONE measurable marketing goal. Return ONLY JSON ' +
      '(no prose, no fences): {"kpi": string, "target": string, "deadline": string (ISO date), ' +
      '"rationale": string, "assumed": boolean}. If the user gave no numbers, propose a sensible ' +
      'target grounded in the provided benchmark ranges and set "assumed": true.';
    const user = `Raw goal: "${opts.rawGoal}"\nBrand: ${opts.brandSummary}\n${opts.benchmarkText}\nReturn the measurable goal as JSON.`;
    const raw = await callStrategyModel({ system, user, userId: opts.userId, temperature: 0.2, maxTokens: 512 });
    const parsed = extractJson<{ kpi?: string; target?: string; deadline?: string; assumed?: boolean }>(raw, 'object');
    if (parsed?.kpi && parsed?.target) {
      const deadline = parsed.deadline ? ` by ${parsed.deadline}` : '';
      const assumedNote = parsed.assumed ? ' (assumed target — adjust if wrong)' : '';
      return `${opts.rawGoal} — measurable target: ${parsed.kpi} to ${parsed.target}${deadline}${assumedNote}`;
    }
    return opts.rawGoal;
  } catch (error) {
    console.error('[Strategy] goal reformulation failed:', error);
    return opts.rawGoal;
  }
}

export async function generateStrategy(input: GenerateStrategyInput): Promise<IStrategy> {
  const { brand, ctx } = await fetchBrandContext(input.brandId, input.orgId);

  const brandName = (brand as { name?: string })?.name ?? 'Unknown Brand';
  const systemPrompt = buildStrategySystemPrompt({
    brandName,
    brandVoice: ctx?.brandVoice ?? '',
    targetAudience: ctx?.targetAudience ?? '',
    industry: ctx?.industry ?? '',
    competitors: ctx?.competitors ?? [],
    keyMessages: ctx?.keyMessages ?? [],
    tone: ctx?.tone ?? 'Professional',
    personality: ctx?.personality ?? 'Expert',
  });

  // Grounding inputs: the brand's connected-channel allowlist + benchmark bands.
  const connected = await getConnectedChannels(input.orgId, input.brandId);
  const connectedChannels = Array.from(connected.channels);
  const benchmarkText = formatBandsForPrompt(connectedChannels);
  const brandSummary = buildBrandContextSummary(brandName, ctx);

  // §8 measurability reformulation gate — vague goal → measurable goal.
  const effectiveGoal = await reformulateGoal({
    rawGoal: input.goal,
    brandSummary,
    benchmarkText,
    userId: input.userId,
  });

  // Fetch parent strategy's iteration notes + prior validation if regenerating.
  let historicalNotes: string | undefined;
  let priorValidationNote: string | undefined;
  if (input.parentStrategyId) {
    const parent = await strategyRepository.findById(input.parentStrategyId);
    historicalNotes = parent?.iterationNotes ?? undefined;
    priorValidationNote = buildPriorValidationNote(parent?.validation);
  }

  let userPrompt = buildStrategyUserPrompt({
    goal: effectiveGoal,
    constraints: input.constraints,
    historicalNotes,
    connectedChannels,
    benchmarkText,
    priorValidationNote,
  });

  // Phase 3 (G9): ground generation in the brand's playbooks — distilled
  // know-how + vertical starters from the Agent Workspace. Appended to the
  // user prompt (not the cached system block).
  try {
    const { getPlaybookContext } = await import('@/lib/agent/workspace');
    const playbooks = await getPlaybookContext({
      userId: input.userId,
      brandId: input.brandId,
    });
    if (playbooks) {
      userPrompt += `\n\nPROVEN PLAYBOOKS for this brand (apply what fits the goal; prefer approaches that worked before):\n${playbooks}`;
    }
  } catch (playbookError) {
    console.error('[Strategy] playbook context failed:', playbookError);
  }

  // 1. Generate (Claude prompt-caches the system block automatically). 4096 —
  //    the full strategy structure needs headroom (1024 truncated flash mid-JSON).
  const raw = await callStrategyModel({
    system: systemPrompt,
    user: userPrompt,
    userId: input.userId,
    temperature: 0.3,
    maxTokens: 4096,
  });
  let parsed = extractJson<RawStrategyOutput>(raw, 'object');

  // 2. Deterministic checks (code, no LLM).
  const validateCtx: ValidateContext = {
    connectedChannels: connected.channels,
    userGoal: input.goal,
    industry: ctx?.industry ?? undefined,
  };
  let result = validateStrategy(parsed, validateCtx);
  let repairAttempts = 0;
  let reviseAttempts = 0;

  // 2a. Auto-repair once if there are errors.
  if (hasError(result)) {
    try {
      const repairUser =
        `The following strategy JSON has validation errors. Fix ONLY these issues and return the ` +
        `corrected JSON object with the same structure — no prose, no fences.\n\nERRORS:\n${errorIssueList(result)}\n\nSTRATEGY:\n${JSON.stringify(parsed)}`;
      const repaired = await callStrategyModel({ system: systemPrompt, user: repairUser, userId: input.userId, temperature: 0.2 });
      parsed = extractJson<RawStrategyOutput>(repaired, 'object');
      repairAttempts += 1;
      result = validateStrategy(parsed, validateCtx);
    } catch (repairError) {
      console.error('[Strategy] auto-repair failed:', repairError);
    }
  }

  // 2b. Regenerate once if still failing (issues appended to the prompt).
  if (hasError(result)) {
    try {
      const regenUser = `${userPrompt}\n\nThe previous attempt failed these checks — avoid them:\n${errorIssueList(result)}`;
      const regen = await callStrategyModel({ system: systemPrompt, user: regenUser, userId: input.userId, temperature: 0.3 });
      parsed = extractJson<RawStrategyOutput>(regen, 'object');
      repairAttempts += 1;
      result = validateStrategy(parsed, validateCtx);
    } catch (regenError) {
      console.error('[Strategy] regenerate failed:', regenError);
    }
  }

  // 3. LLM critic pass — only when the structure is sound (errors resolved).
  let critic: CritiqueResult | undefined;
  if (!hasError(result)) {
    critic = await critiqueStrategy({
      userId: input.userId,
      strategy: parsed as unknown as Record<string, unknown>,
      brandContextSummary: brandSummary,
      connectedChannels: connected.channels,
      benchmarkText,
      userGoal: effectiveGoal,
    });

    // 3a. One revise loop if the critic flags low scores or must-fixes.
    if (needsRevise(critic)) {
      try {
        const mustFix = critic.dimensions.flatMap((d) => d.mustFix);
        const reviseUser =
          `Revise the strategy to resolve these must-fix items; keep everything else intact. ` +
          `Return the full corrected JSON object — no prose, no fences.\n\nMUST-FIX:\n${mustFix.map((m) => `- ${m}`).join('\n')}\n\nSTRATEGY:\n${JSON.stringify(parsed)}`;
        const revised = await callStrategyModel({ system: systemPrompt, user: reviseUser, userId: input.userId, temperature: 0.3 });
        parsed = extractJson<RawStrategyOutput>(revised, 'object');
        reviseAttempts += 1;
        result = validateStrategy(parsed, validateCtx); // re-run cheap checks
      } catch (reviseError) {
        console.error('[Strategy] critic revise failed:', reviseError);
      }
    }
  }

  // 4. Assemble the validation subdoc.
  const validation: StrategyValidation = {
    status: result.status,
    deterministic: result.issues,
    critic:
      critic && critic.dimensions.length > 0
        ? { dimensions: critic.dimensions, overall: critic.overall, summary: critic.summary }
        : undefined,
    qualityScore: computeQualityScore(critic, result),
    checkedAt: new Date(),
    repairAttempts,
    reviseAttempts,
  };

  const version = await strategyRepository.getNextVersion(input.orgId, input.brandId);

  const strategy = await strategyRepository.create({
    orgId: input.orgId,
    brandId: input.brandId,
    name: parsed.name,
    description: parsed.description,
    goals: (parsed.goals ?? []).map(g => ({
      kpi: g.kpi,
      target: g.target,
      deadline: new Date(g.deadline),
    })),
    channels: parsed.channels ?? [],
    contentMix: parsed.contentMix ?? {},
    cadence: parsed.cadence ?? {},
    status: 'draft',
    version,
    parentStrategyId: input.parentStrategyId ?? null,
    validation,
  });

  return strategy;
}

export async function decomposeStrategy(
  strategyId: string,
  opts: { orgId: string; brandId: string; userId?: string },
): Promise<IStrategy & { roadmap: RoadmapEntry[] }> {
  const strategy = await strategyRepository.findById(strategyId);
  if (!strategy) throw new Error(`Strategy ${strategyId} not found`);

  const { brand } = await fetchBrandContext(opts.brandId, opts.orgId);
  const brandName = (brand as { name?: string })?.name ?? 'Unknown Brand';

  const systemPrompt = buildStrategySystemPrompt({
    brandName,
    brandVoice: '',
    targetAudience: '',
    industry: '',
    competitors: [],
    keyMessages: [],
    tone: 'Professional',
    personality: 'Expert',
  });

  const userPrompt = buildDecomposeRoadmapPrompt({
    strategyName: strategy.name,
    strategyDescription: strategy.description ?? '',
    goals: strategy.goals.map(g => ({
      kpi: g.kpi,
      target: g.target,
      deadline: g.deadline.toISOString(),
    })),
    channels: strategy.channels,
    cadence: (strategy.cadence ?? {}) as Record<string, number>,
  });

  // Same task routing as generation — a hardcoded model here breaks the whole
  // activate path whenever that one provider has no key configured.
  const { AISettingsService } = await import('@/lib/services/ai-settings.service');
  const pref = await AISettingsService.getPreferredModel(opts.userId, 'agentStrategy');

  const raw = await generateTextWithClient({
    model: pref.modelId,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    maxTokens: 4096,
    temperature: 0.2,
    routeHint: pref.routeHint,
  });

  const decoded = extractJson<RoadmapEntry[] | { entries?: RoadmapEntry[] }>(raw, 'array');
  const entries: RoadmapEntry[] = Array.isArray(decoded) ? decoded : decoded.entries ?? [];

  // Persist roadmap.
  const existing = await strategyRepository.getRoadmap(strategyId);
  if (existing) {
    await strategyRepository.updateRoadmap(strategyId, { entries });
  } else {
    await strategyRepository.createRoadmap({
      strategyId: (strategy._id as unknown as { toString(): string }).toString(),
      orgId: opts.orgId,
      brandId: opts.brandId,
      entries,
    });
  }

  return { ...strategy, roadmap: entries } as IStrategy & { roadmap: RoadmapEntry[] };
}
