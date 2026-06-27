/**
 * Roadmap → missions instantiation (B1-1.4).
 *
 * Takes a persisted roadmap (linked to a strategy) and creates AgentMission
 * entries for each pending entry. Entries with dependsOn are only instantiated
 * when their prerequisites are complete.
 *
 * Also handles B1-1.5 (iterateStrategy) — wraps the generator with
 * performance data to produce a new strategy version.
 */

import { connectMongoose } from '@/lib/mongodb';
import { agentMissionRepository } from '@/lib/db/repository/agent-mission.repository';
import { strategyRepository } from '@/lib/db/repository/strategy.repository';
import { generateStrategy } from './generator';
import type { RoadmapEntry } from '@/lib/db/models/strategy-roadmap.model';

export interface InstantiateRoadmapInput {
  strategyId: string;
  orgId: string;
  brandId: string;
  userId: string;
}

export interface InstantiateRoadmapResult {
  instantiated: string[];   // Mission IDs created
  deferred: string[];       // Entry IDs whose dependencies haven't completed yet
}

export async function instantiateRoadmap(
  input: InstantiateRoadmapInput,
): Promise<InstantiateRoadmapResult> {
  await connectMongoose();

  const roadmap = await strategyRepository.getRoadmap(input.strategyId);
  if (!roadmap) throw new Error(`No roadmap found for strategy ${input.strategyId}`);

  const entries = roadmap.entries as RoadmapEntry[];
  const completedIds = new Set(
    entries.reduce<string[]>((acc, e) => {
      if (e.status === 'completed') acc.push(e.id);
      return acc;
    }, []),
  );

  const instantiated: string[] = [];
  const deferred: string[] = [];
  const updatedEntries = [...entries];

  for (const entry of updatedEntries) {
    if (entry.status !== 'pending') continue;

    // Check all dependencies are satisfied.
    const depsReady = entry.dependsOn.every(dep => completedIds.has(dep));
    if (!depsReady) {
      deferred.push(entry.id);
      continue;
    }

    const mission = await agentMissionRepository.create({
      brandId: input.brandId,
      userId: input.userId,
      strategyId: input.strategyId,
      templateId: entry.missionTemplateId || undefined,
      title: entry.title,
      summary: entry.description ?? `Mission from strategy roadmap: ${entry.title}`,
    });

    const missionId = (mission._id as { toString(): string }).toString();

    // Link mission back to roadmap entry.
    entry.missionId = missionId;
    entry.status = 'in_progress';
    instantiated.push(missionId);
  }

  // Persist updated entry statuses.
  if (instantiated.length > 0) {
    await strategyRepository.updateRoadmap(input.strategyId, { entries: updatedEntries });
  }

  return { instantiated, deferred };
}

export interface IterateStrategyInput {
  strategyId: string;
  orgId: string;
  brandId: string;
  userId: string;
  /** Free-text performance notes from mission analytics. */
  performanceData: string;
  /**
   * When false the new version stays 'draft' so activation can go through an
   * approval gate (Goal Mode). Defaults to true — the original behaviour.
   */
  autoActivate?: boolean;
}

/**
 * Creates a new strategy version based on analytics feedback (B1-1.5).
 * The iteration notes are baked into the new generation prompt so Claude
 * adjusts channel weights / cadence based on what worked.
 */
export async function iterateStrategy(input: IterateStrategyInput) {
  const original = await strategyRepository.findById(input.strategyId);
  if (!original) throw new Error(`Strategy ${input.strategyId} not found`);

  // Store performance notes on the original version.
  await strategyRepository.update(input.strategyId, {
    iterationNotes: input.performanceData,
    status: 'archived',
  });

  // Generate a new version with historical context.
  const newStrategy = await generateStrategy({
    orgId: input.orgId,
    brandId: input.brandId,
    goal: original.goals.map(g => `${g.kpi}: ${g.target}`).join('; '),
    userId: input.userId,
    parentStrategyId: input.strategyId,
  });

  // Activate the new strategy (unless the caller wants to gate activation).
  if (input.autoActivate !== false) {
    await strategyRepository.updateStatus(
      (newStrategy._id as { toString(): string }).toString(),
      'active',
    );
  }

  return newStrategy;
}
