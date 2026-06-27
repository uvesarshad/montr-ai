/**
 * Mission lifecycle hooks (B1-6.3, B1-6.4).
 *
 * Called after a mission transitions to 'completed'. Handles:
 *  - Mission chaining: spawn follow-up missions from the template's onComplete list.
 *  - Self-correcting plans: trigger strategy iteration when a strategy-linked mission finishes.
 *  - Shared memory: write the completed mission's output to agent memory so chained missions can read it.
 */

import { connectMongoose } from '@/lib/mongodb';
import { agentMissionRepository } from '@/lib/db/repository/agent-mission.repository';
import AgentMission from '@/lib/db/models/agent-mission.model';
import { getMissionTemplateById } from '@/lib/agent/mission-templates';
import { iterateStrategy } from '@/lib/strategy/instantiate';
import AgentMemory from '@/lib/db/models/agent-memory.model';

/**
 * Called synchronously (fire-and-forget) after a mission is marked completed.
 * Errors are swallowed so the caller's response is never blocked.
 */
export async function onMissionComplete(missionId: string, organizationId: string): Promise<void> {
  try {
    await connectMongoose();

    const mission = await AgentMission.findOne({ _id: missionId }).lean().exec();
    if (!mission || mission.status !== 'completed') return;

    const m = mission as {
      _id: unknown;
      templateId?: string;
      strategyId?: string;
      chainedFromMissionId?: string;
      brandId: string;
      userId: string;
      title: string;
      summary: string;
      latestAssistantMessage?: string;
      status: string;
      usage?: { tokens?: number; toolCalls?: number };
    };

    await Promise.allSettled([
      handleChaining(m),
      handleStrategyIteration(m, organizationId),
    ]);
  } catch (err) {
    console.error('[lifecycle] onMissionComplete error:', err);
  }
}

// ─── Chaining ─────────────────────────────────────────────────────────────────

async function handleChaining(
  mission: { _id: unknown; templateId?: string; brandId: string; userId: string; title: string; summary: string; latestAssistantMessage?: string }
): Promise<void> {
  if (!mission.templateId) return;

  const template = getMissionTemplateById(mission.templateId);
  if (!template?.onComplete?.length) return;

  const missionId = (mission._id as { toString(): string }).toString();

  // Write completed mission output to shared memory so follow-ups can read it.
  const outputValue = mission.latestAssistantMessage || mission.summary;
  await AgentMemory.findOneAndUpdate(
    { brandId: mission.brandId, key: `mission_output:${missionId}` },
    {
      brandId: mission.brandId,
      key: `mission_output:${missionId}`,
      value: outputValue,
      description: `Output of completed mission: ${mission.title}`,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
    { upsert: true, new: true },
  );

  for (const followUpTemplateId of template.onComplete) {
    const followUpTemplate = getMissionTemplateById(followUpTemplateId);
    if (!followUpTemplate) continue;

    await agentMissionRepository.create({
      brandId: mission.brandId,
      userId: mission.userId,
      title: followUpTemplate.title,
      summary: followUpTemplate.summary,
      templateId: followUpTemplateId,
      chainedFromMissionId: missionId,
    } as Parameters<typeof agentMissionRepository.create>[0]);
  }
}

// ─── Strategy iteration ───────────────────────────────────────────────────────

async function handleStrategyIteration(
  mission: { _id: unknown; strategyId?: string; brandId: string; userId: string; summary: string; usage?: { tokens?: number; toolCalls?: number }; status: string },
  organizationId: string,
): Promise<void> {
  if (!mission.strategyId) return;

  const performanceData = [
    `Mission status: ${mission.status}`,
    `Summary: ${mission.summary}`,
    `Tokens used: ${mission.usage?.tokens ?? 0}`,
    `Tool calls: ${mission.usage?.toolCalls ?? 0}`,
  ].join('\n');

  await iterateStrategy({
    strategyId: mission.strategyId,
    orgId: organizationId,
    brandId: mission.brandId,
    userId: mission.userId,
    performanceData,
  });
}
