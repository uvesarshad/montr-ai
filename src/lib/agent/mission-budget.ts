import AgentMission, {
  AgentMissionTerminatedReason,
  IAgentMission,
} from '@/lib/db/models/agent-mission.model';
import { agentMissionRepository } from '@/lib/db/repository/agent-mission.repository';

export type BudgetKind = 'toolCall' | 'tokens' | 'credits';

export interface BudgetCheckResult {
  ok: boolean;
  exceeded?: AgentMissionTerminatedReason;
  message?: string;
}

const KIND_TO_USAGE_FIELD: Record<BudgetKind, string> = {
  toolCall: 'usage.toolCalls',
  tokens: 'usage.tokens',
  credits: 'usage.credits',
};

const KIND_TO_LIMIT_FIELD: Record<BudgetKind, string> = {
  toolCall: 'limits.maxToolCalls',
  tokens: 'limits.maxTokens',
  credits: 'limits.maxCredits',
};

const KIND_TO_REASON: Record<BudgetKind, AgentMissionTerminatedReason> = {
  toolCall: 'tool_calls_exceeded',
  tokens: 'tokens_exceeded',
  credits: 'budget_exceeded',
};

/**
 * Atomically increment a mission usage counter only if the result fits within the limit.
 * Returns ok:false with a typed reason when the limit would be exceeded.
 */
export async function checkAndIncrement(
  missionId: string,
  kind: BudgetKind,
  amount: number = 1,
): Promise<BudgetCheckResult> {
  if (amount <= 0) {
    return { ok: true };
  }

  const usageField = KIND_TO_USAGE_FIELD[kind];
  const limitField = KIND_TO_LIMIT_FIELD[kind];

  const updated = await AgentMission.findOneAndUpdate(
    {
      _id: missionId,
      $expr: {
        $lte: [
          { $add: [{ $ifNull: [`$${usageField}`, 0] }, amount] },
          { $ifNull: [`$${limitField}`, Number.MAX_SAFE_INTEGER] },
        ],
      },
    },
    { $inc: { [usageField]: amount } },
    { new: true },
  ).exec();

  if (!updated) {
    return {
      ok: false,
      exceeded: KIND_TO_REASON[kind],
      message: `Mission budget exceeded: ${kind}`,
    };
  }

  // B1-7.4 — auto-pilot fallback: when usage reaches 90% of cap, switch autopilot → mixed
  // so remaining calls go through supervised HITL instead of hard-terminating.
  if (updated.mode === 'autopilot') {
    const usageVal: number = kind === 'toolCall'
      ? (updated.usage?.toolCalls ?? 0)
      : kind === 'tokens'
        ? (updated.usage?.tokens ?? 0)
        : (updated.usage?.credits ?? 0);
    const limitVal: number = kind === 'toolCall'
      ? (updated.limits?.maxToolCalls ?? 0)
      : kind === 'tokens'
        ? (updated.limits?.maxTokens ?? 0)
        : (updated.limits?.maxCredits ?? 0);

    if (limitVal > 0 && usageVal / limitVal >= 0.9) {
      await AgentMission.updateOne(
        { _id: missionId, mode: 'autopilot' },
        { $set: { mode: 'mixed' } },
      ).exec().catch(() => {});
    }
  }

  return { ok: true };
}

/**
 * Increment per-tool retry counter and report whether the retry budget is exhausted.
 * Always increments; the caller must respect the exhausted flag.
 */
export async function incrementRetry(
  missionId: string,
  toolName: string,
): Promise<BudgetCheckResult> {
  const safeKey = toolName.replace(/[.$]/g, '_');
  const path = `usage.retriesByTool.${safeKey}`;

  const updated = await AgentMission.findOneAndUpdate(
    { _id: missionId },
    { $inc: { [path]: 1 } },
    { new: true },
  ).exec();

  if (!updated) {
    return { ok: true };
  }

  const retries = (updated.usage?.retriesByTool?.[safeKey] as number | undefined) ?? 0;
  const max = updated.limits?.maxRetriesPerTool ?? Number.MAX_SAFE_INTEGER;

  if (retries > max) {
    return {
      ok: false,
      exceeded: 'retry_exhausted',
      message: `Retry budget exhausted for ${toolName}`,
    };
  }
  return { ok: true };
}

/**
 * Check wall-clock against the current wake session. No mutation; pure read.
 *
 * Long-horizon missions hibernate and wake (Phase 1 2026-06-05): the budget
 * applies per wake-session, measured from sessionStartedAt when set. Missions
 * that never hibernated have no sessionStartedAt and fall back to createdAt —
 * identical to the original behaviour.
 */
export function checkWallClock(
  mission: Pick<IAgentMission, 'createdAt' | 'limits'> & { sessionStartedAt?: Date | null },
): BudgetCheckResult {
  const max = mission.limits?.maxWallClockMs;
  if (!max) return { ok: true };
  const base = mission.sessionStartedAt ?? mission.createdAt;
  const elapsed = Date.now() - new Date(base).getTime();
  if (elapsed > max) {
    return {
      ok: false,
      exceeded: 'wallclock_exceeded',
      message: `Mission wall-clock budget exceeded for this session`,
    };
  }
  return { ok: true };
}

/**
 * Mark a mission as terminated due to budget exhaustion.
 * Sets status=blocked, writes terminatedReason, appends an error event.
 */
export async function terminateMission(
  mission: Pick<IAgentMission, 'brandId' | 'userId'> & { _id: string | { toString(): string } },
  missionId: string,
  reason: AgentMissionTerminatedReason,
  message: string,
): Promise<void> {
  await AgentMission.updateOne(
    { _id: missionId },
    { $set: { status: 'blocked', terminatedReason: reason } },
  ).exec().catch((error) => {
    console.error('[MissionBudget] Failed to terminate mission:', error);
  });

  await agentMissionRepository.appendEvent({
    missionId,
    brandId: mission.brandId,
    userId: mission.userId,
    type: 'error',
    role: 'system',
    content: message,
    metadata: {
      terminatedReason: reason,
    },
  }).catch((error) => {
    console.error('[MissionBudget] Failed to append termination event:', error);
  });
}
