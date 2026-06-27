// OSS carve stub (always-allow) of src/lib/agent/plan-gate.ts — single-tenant, unmetered.
/**
 * Agent plan-tier gating — OSS single-tenant stub.
 *
 * The private build gates agent features by plan tier (allowAgent, allowedModels,
 * autonomy modes, token/tool/wall-clock budgets). The OSS build is single-tenant and
 * unmetered: there is no plan repo to query, so every check is always-allow with
 * unlimited caps. Exported symbols + signatures match the source exactly so the 5
 * call-sites do not move.
 */

export type AutonomyMode = 'watch' | 'supervised' | 'autopilot';

export interface AgentPlanGateResult {
  allowed: boolean;
  reason?: string;
  allowAgent: boolean;
  allowedModels: string[];
  defaultModel: string;
  routerModel: string;
  maxTokensUsdCents: number;
  maxToolCalls: number;
  maxWallClockHours: number;
  allowedAutonomyModes: AutonomyMode[];
  defaultAutonomyMode: AutonomyMode;
  /** Agent-created scheduled tasks + triggers per brand (0 = none, -1 = unlimited). */
  maxActiveSchedules: number;
  /** Floor for hibernating-mission wake cadence in minutes (1440 = daily). */
  minWakeIntervalMinutes: number;
  /** Ads write gate (A3) — false blocks create_ad_campaign even with approval. */
  allowAdsWrite: boolean;
}

export interface AgentGateInput {
  userId: string;
  /** When true the user supplied their own API key — bypasses allowedModels. */
  isByok?: boolean;
  modelId?: string;
  autonomyMode?: AutonomyMode;
  /** Current mission spend in USD cents — checked against maxTokensUsdCents. */
  currentMissionCostUsdCents?: number;
}

/**
 * Always-allow gate. No plan repo, no budgets, no organizationId.
 * All caps are unlimited (-1); every autonomy mode is permitted; ads write is on.
 * The caller-supplied modelId (if any) is echoed back as the default so any model is
 * honoured; an empty allowedModels list means "no model restriction".
 */
export async function checkAgentGate(input: AgentGateInput): Promise<AgentPlanGateResult> {
  const model = input.modelId ?? 'claude-haiku-4-5-20251001';

  return {
    allowed: true,
    allowAgent: true,
    allowedModels: [],
    defaultModel: model,
    routerModel: 'claude-haiku-4-5-20251001',
    maxTokensUsdCents: -1,
    maxToolCalls: -1,
    maxWallClockHours: -1,
    allowedAutonomyModes: ['watch', 'supervised', 'autopilot'],
    defaultAutonomyMode: input.autonomyMode ?? 'autopilot',
    maxActiveSchedules: -1,
    minWakeIntervalMinutes: 1,
    allowAdsWrite: true,
  };
}
