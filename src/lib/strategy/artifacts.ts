/**
 * Strategy chat artifacts (WOW bridge, Phase 1, 2026-06-27).
 *
 * Structured payloads that ride on the strategy tool results (the `artifact`
 * field) so the agent chat can switch on `artifact.kind` and render a live
 * strategy card instead of parsing prose. Both the draft and the activation
 * shapes are defined here, plus the mappers that derive them from the
 * persisted IStrategy / roadmap so tools never hand-roll the shape.
 *
 * Contract (shared with the chat renderer — Stage 2):
 *   - StrategyDraftArtifact      → generate_strategy / iterate_strategy results
 *   - StrategyActivationArtifact → activate_strategy result WHEN it is HITL-gated
 */

import type { IStrategy, StrategyValidationStatus } from '@/lib/db/models/strategy.model';
import type { RoadmapEntry } from '@/lib/db/models/strategy-roadmap.model';

export interface StrategyDraftArtifact {
  kind: 'strategy_draft';
  strategyId: string;
  version: number;
  name: string;
  description: string;
  /** 0-100, derived display/sort score from the validation subdoc. */
  qualityScore: number;
  validationStatus: StrategyValidationStatus; // 'passed' | 'passed_with_warnings' | 'failed'
  /** Deterministic-check messages (severity warn OR error) — the honest caveats. */
  warnings: string[];
  goals: Array<{ kpi: string; target: string; deadline: string }>;
  channels: string[];
  cadence: Record<string, number>;
  contentMix?: Record<string, number>;
  /** Version of the strategy this draft iterated from, when known. */
  parentVersion?: number;
  /** false only when validationStatus === 'failed' (block one-click activate). */
  canActivate: boolean;
}

export interface StrategyRoadmapSummary {
  totalEntries: number;
  /** Entries that will spawn a mission immediately on activation (deps satisfied). */
  willSpawn: number;
  /** Entries that wait on dependencies before spawning. */
  deferred: number;
  /** Titles of the first missions that will start now (preview, capped). */
  firstMissionTitles: string[];
}

export interface StrategyActivationArtifact {
  kind: 'strategy_activation';
  strategyId: string;
  /** The PendingAgentAction the user must approve — the single sign-off. */
  pendingActionId: string;
  roadmap: StrategyRoadmapSummary;
}

export type StrategyArtifact = StrategyDraftArtifact | StrategyActivationArtifact;

const MAX_FIRST_MISSION_TITLES = 5;

function strategyIdString(strategy: IStrategy): string {
  return (strategy._id as { toString(): string }).toString();
}

/** Cadence subdoc → a plain Record, dropping undefined/0 noise is intentional NOT —
 *  keep every defined numeric weight so the card can show the full cadence. */
function cadenceToRecord(cadence: IStrategy['cadence']): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(cadence ?? {})) {
    if (typeof value === 'number') out[key] = value;
  }
  return out;
}

function contentMixToRecord(mix: IStrategy['contentMix']): Record<string, number> | undefined {
  const entries = Object.entries(mix ?? {}).filter(([, v]) => typeof v === 'number') as Array<[string, number]>;
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

/**
 * Map a persisted strategy → the chat draft artifact.
 *
 * Validation mapping:
 *   - qualityScore     = validation.qualityScore (0 when legacy / absent)
 *   - validationStatus = validation.status ('passed_with_warnings' when absent —
 *                        a legacy strategy with no validation can still activate)
 *   - warnings         = deterministic[].message for severity warn OR error
 *   - canActivate      = validationStatus !== 'failed'
 */
export function buildStrategyDraftArtifact(
  strategy: IStrategy,
  opts?: { parentVersion?: number },
): StrategyDraftArtifact {
  const validation = strategy.validation;
  const validationStatus: StrategyValidationStatus = validation?.status ?? 'passed_with_warnings';
  const warnings = (validation?.deterministic ?? [])
    .filter((issue) => issue.severity === 'warn' || issue.severity === 'error')
    .map((issue) => issue.message);

  return {
    kind: 'strategy_draft',
    strategyId: strategyIdString(strategy),
    version: strategy.version,
    name: strategy.name,
    description: strategy.description ?? '',
    qualityScore: validation?.qualityScore ?? 0,
    validationStatus,
    warnings,
    goals: (strategy.goals ?? []).map((g) => ({
      kpi: g.kpi,
      target: g.target,
      deadline: g.deadline ? new Date(g.deadline).toISOString() : '',
    })),
    channels: strategy.channels ?? [],
    cadence: cadenceToRecord(strategy.cadence),
    contentMix: contentMixToRecord(strategy.contentMix),
    parentVersion: opts?.parentVersion,
    canActivate: validationStatus !== 'failed',
  };
}

/**
 * Dry-run roadmap preview — the same dependency logic instantiateRoadmap uses,
 * but read-only (spawns nothing). Lets the activation approval card show what
 * will happen before the user signs off.
 */
export function summarizeRoadmapForActivation(entries: RoadmapEntry[]): StrategyRoadmapSummary {
  const completedIds = new Set(entries.filter((e) => e.status === 'completed').map((e) => e.id));

  const willSpawnTitles: string[] = [];
  let deferred = 0;

  for (const entry of entries) {
    if (entry.status !== 'pending') continue;
    const depsReady = (entry.dependsOn ?? []).every((dep) => completedIds.has(dep));
    if (depsReady) {
      willSpawnTitles.push(entry.title);
    } else {
      deferred += 1;
    }
  }

  return {
    totalEntries: entries.length,
    willSpawn: willSpawnTitles.length,
    deferred,
    firstMissionTitles: willSpawnTitles.slice(0, MAX_FIRST_MISSION_TITLES),
  };
}

export function buildStrategyActivationArtifact(input: {
  strategyId: string;
  pendingActionId: string;
  entries: RoadmapEntry[];
}): StrategyActivationArtifact {
  return {
    kind: 'strategy_activation',
    strategyId: input.strategyId,
    pendingActionId: input.pendingActionId,
    roadmap: summarizeRoadmapForActivation(input.entries),
  };
}
