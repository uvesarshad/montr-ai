/**
 * OSS agent safety defaults (H6 liability).
 *
 * The autonomous agent ships in the OSS core. A fresh self-host install must
 * default to SAFE, supervised behaviour with conservative hard caps so that an
 * operator who just `docker compose up`s cannot have the agent send messages,
 * spend AI credits, or fan out missions without explicit human approval.
 *
 * The posture is expressed as SCHEMA DEFAULTS (see agent-mission.model.ts and
 * the mission repository) — not prose — so the safe behaviour holds without any
 * configuration. It is opt-OUT via a single env flag so the managed/cloud
 * deployment can restore the more permissive defaults it was built around:
 *
 *   MONTRAI_AGENT_AUTONOMY
 *     unset | 'supervised' (default)  → safe out-of-the-box (supervised mode,
 *                                        conservative spend + rate caps)
 *     'permissive'                    → legacy/cloud defaults (mixed mode,
 *                                        generous caps)
 *
 * Either way the user can still explicitly switch an individual mission to
 * 'autonomous'/'autopilot' — these defaults only govern what a brand-new
 * mission does before anyone opts in.
 */

import type { AgentMissionLimits, AgentMissionMode } from '@/lib/db/models/agent-mission.model';

/** True when the deployment has opted into the permissive (cloud/legacy) posture. */
export function isPermissiveAgentAutonomy(): boolean {
  return (process.env.MONTRAI_AGENT_AUTONOMY ?? '').trim().toLowerCase() === 'permissive';
}

/**
 * Supervised default — every consequential / outbound action is gated through
 * HITL approval (approval-first gates all non-read-only tools; see hitl-gateway).
 */
export const SUPERVISED_DEFAULT_MODE: AgentMissionMode = 'approval-first';
/** Legacy/cloud default — only the brand's requireApproval list is gated. */
export const PERMISSIVE_DEFAULT_MODE: AgentMissionMode = 'mixed';

/** Default mission mode for newly created missions. Supervised unless explicitly permissive. */
export function resolveDefaultMissionMode(): AgentMissionMode {
  return isPermissiveAgentAutonomy() ? PERMISSIVE_DEFAULT_MODE : SUPERVISED_DEFAULT_MODE;
}

/**
 * Conservative per-mission spend + rate caps for a self-host install.
 * Roughly a quarter of the permissive caps — enough to be useful, low enough
 * that a runaway loop is bounded to a small, recoverable amount of spend.
 */
export const SUPERVISED_MISSION_LIMITS: AgentMissionLimits = {
  maxToolCalls: 25,
  maxTokens: 150_000,
  maxWallClockMs: 10 * 60 * 1000,
  maxCredits: 100,
  maxRetriesPerTool: 2,
};

/** Generous per-mission caps used by the managed/cloud deployment. */
export const PERMISSIVE_MISSION_LIMITS: AgentMissionLimits = {
  maxToolCalls: 100,
  maxTokens: 500_000,
  maxWallClockMs: 30 * 60 * 1000,
  maxCredits: 1000,
  maxRetriesPerTool: 3,
};

/** Default per-mission spend + rate caps. Conservative unless explicitly permissive. */
export function resolveDefaultMissionLimits(): AgentMissionLimits {
  return isPermissiveAgentAutonomy() ? PERMISSIVE_MISSION_LIMITS : SUPERVISED_MISSION_LIMITS;
}

/**
 * Hard cap on how many event-triggered missions a single org may auto-spawn
 * within a rolling window. Bounds the blast radius of a misconfigured trigger
 * loop (e.g. a webhook that fires a mission that emits an event that re-fires
 * the trigger). Enforced in mission-trigger-service.
 */
export const MISSION_SPAWN_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const SUPERVISED_MAX_MISSIONS_PER_WINDOW = 20;
export const PERMISSIVE_MAX_MISSIONS_PER_WINDOW = 200;

export function resolveMaxMissionsPerWindow(): number {
  return isPermissiveAgentAutonomy()
    ? PERMISSIVE_MAX_MISSIONS_PER_WINDOW
    : SUPERVISED_MAX_MISSIONS_PER_WINDOW;
}
