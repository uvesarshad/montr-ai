/**
 * BrainProvider — the agent "brain" injectable seam (master §2A.6 L2).
 *
 * The agent's reasoning/strategy "brain" — the static know-how that grounds and
 * shapes how it thinks — resolves through an injectable PROVIDER so the OSS CORE
 * and a managed/cloud OVERLAY can differ on DATA / BREADTH / SCALE while sharing
 * the exact same MECHANISM. Tiering NEVER touches the generation/reasoning code;
 * it only swaps what this provider returns:
 *
 *   - CORE binds {@link GenericBrainProvider}: generic system-prompt addenda,
 *     the ~12-15 static starter playbooks + the brand's own distilled playbooks,
 *     BYOK frontier models, and own-data grounding bands. This is exactly the
 *     behaviour the platform shipped before the seam — a faithful wrap, no
 *     regression.
 *   - An OVERLAY/cloud layer can bind a CURATED provider (premium playbook
 *     packs, network grounding, tuned/eval-certified models) WITHOUT editing
 *     generator.ts or the agent loop — they only ever talk to the interface.
 *
 * Binding mirrors the entitlement / safety-default pattern: a process-wide
 * default (generic) plus a {@link bindBrainProvider} hook the overlay calls at
 * startup. Pure module — interface + types + binding only; the generic
 * implementation lives in ./generic-provider and is lazy-loaded so this file
 * stays importable from any layer (including pure unit tests).
 */

import type { RouteHint } from '@/ai/types';
import { GenericBrainProvider } from './generic-provider';

/** Tenant/brand scope every brain lookup is resolved against. */
export interface BrainContext {
  userId: string;
  brandId: string;
}

/** Playbook grounding query — the brain context plus optional budget caps. */
export interface BrainPlaybookQuery extends BrainContext {
  /** Max characters of distilled playbook text to return. */
  maxChars?: number;
  /** Max number of playbook docs to concatenate. */
  maxDocs?: number;
}

/** Grounding-band query — which channels (and optionally industry) to band. */
export interface BrainGroundingQuery {
  /** Connected/active channels to prefer bands for; empty = core bands. */
  channels?: string[];
  /** Optional industry vertical for per-vertical band overrides. */
  industry?: string;
}

/** A brain task id (maps to the AI task-routing taxonomy, e.g. AI_TASKS ids). */
export type BrainTask = 'agentStrategy' | 'copilotAgent' | (string & {});

/**
 * Resolved model preference. Structurally compatible with `AIPreference` (the
 * fields the agent loop + strategy generator actually consume): the chosen
 * model id, its route hint, and where the choice came from.
 */
export interface BrainModelPreference {
  modelId: string;
  routeHint?: RouteHint;
  /** 'fallback' = nobody chose it; callers may substitute a plan-tier default. */
  source?: 'user' | 'system' | 'fallback';
}

/**
 * The injectable brain. Every method is a pure lookup of static/own know-how —
 * NONE of them generate or reason. Generation code calls these and feeds the
 * results into its existing prompt/model machinery unchanged.
 */
export interface BrainProvider {
  /** Stable identifier, e.g. 'generic'. Used for diagnostics + tests. */
  readonly id: string;

  /**
   * Extra system-prompt text to append to the agent / strategy system prompt
   * (tone, premium operating instructions, certified guardrails…). The generic
   * core returns '' — it adds nothing beyond what core already builds.
   */
  getSystemPromptAddenda(ctx: BrainContext): Promise<string>;

  /**
   * Distilled playbook grounding text for prompt injection. Generic core wraps
   * the brand's Agent-Workspace Playbooks/ (static starters + own-distilled).
   * Returns '' when there is nothing to ground on.
   */
  getPlaybooks(query: BrainPlaybookQuery): Promise<string>;

  /**
   * Realistic benchmark ranges to ground target setting. Generic core wraps the
   * static, own-data benchmark bands. Synchronous (pure constant lookup).
   */
  getGroundingBands(query: BrainGroundingQuery): string;

  /**
   * Preferred model for a brain task. Generic core wraps AISettingsService
   * (user → system → fallback), i.e. BYOK-capable own-key routing.
   */
  getPreferredModel(ctx: BrainContext, task: BrainTask): Promise<BrainModelPreference>;
}

// ─── Binding / resolution ──────────────────────────────────────────────────

let boundProvider: BrainProvider | null = null;
let cachedGeneric: BrainProvider | null = null;

/**
 * Bind a brain provider for the whole process. Called by an overlay/cloud layer
 * at startup to swap in a curated brain. Passing `null` resets to the generic
 * core default. Returns the now-active provider.
 */
export function bindBrainProvider(provider: BrainProvider | null): BrainProvider {
  boundProvider = provider;
  return resolveBrainProvider();
}

/**
 * Resolve the active brain provider. Returns the overlay-bound provider when one
 * has been bound, otherwise the generic core default (lazy-instantiated). Core
 * always has a working brain with zero configuration.
 */
export function resolveBrainProvider(): BrainProvider {
  if (boundProvider) return boundProvider;
  // generic-provider only type-imports from this module, so there is no runtime
  // cycle; its own DB-touching deps are dynamic-imported inside its methods.
  if (!cachedGeneric) cachedGeneric = new GenericBrainProvider();
  return cachedGeneric;
}
