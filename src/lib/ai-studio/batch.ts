/**
 * AI Studio batch generation.
 *
 * Accept a list of prompts → fan out N sessions on a shared `batchId` →
 * dispatch each through `runSession()`. When Redis/BullMQ is configured the
 * fan-out goes through a queue (parallel + survives restarts); otherwise we
 * fall through to inline sequential processing — same fallback strategy as
 * the workflow execution queue.
 *
 * Sessions all live on the same `AiStudioProject` doc; the `batchId` field
 * groups them. `getBatchStatus()` rolls up per-batch progress for the UI.
 */

import { randomUUID } from 'crypto';
import { Queue, ConnectionOptions } from 'bullmq';
import { Types } from 'mongoose';
import { connectMongoose } from '@/lib/mongodb';
import { AiStudioProject, AiStudioProjectKind, IAiStudioSession } from '@/lib/db/models/ai-studio-project.model';
import { getRedisConnection, isQueueConfigured } from '@/lib/workflow/queue/connection';
import { openSession, runSession, RunSessionInput } from './orchestration';
import { Plan, UserProfile } from '@/lib/auth/types';
import { ApiKeys } from '@/ai/types';

export const AI_STUDIO_BATCH_QUEUE = 'ai-studio-batch';

export interface BatchPromptEntry {
  prompt: string;
  systemPrompt?: string;
  settings?: Record<string, unknown>;
  characterId?: Types.ObjectId | string;
}

export interface CreateBatchInput {
  projectId: Types.ObjectId | string;
  kind: AiStudioProjectKind;
  model: string;
  prompts: BatchPromptEntry[];
  /** Per-session cost cap — sessions that would exceed it are auto-cancelled. */
  costCapCents?: number;
  /** Caller context for the router. */
  userProfile?: UserProfile | null;
  userPlan?: Plan | null;
  userApiKeys?: ApiKeys;
}

export interface BatchCreatedResult {
  batchId: string;
  sessionIds: string[];
  queued: boolean; // true if BullMQ queue was used; false for inline
}

let cachedBatchQueue: Queue | null | undefined;

function getBatchQueue(): Queue | null {
  if (cachedBatchQueue !== undefined) return cachedBatchQueue;
  const connection = getRedisConnection();
  if (!connection) {
    cachedBatchQueue = null;
    return null;
  }
  cachedBatchQueue = new Queue(AI_STUDIO_BATCH_QUEUE, {
    connection: connection as unknown as ConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
  return cachedBatchQueue;
}

/**
 * Create a batch — opens N pending sessions and either enqueues each or runs
 * them inline. Returns immediately with the batch id; caller polls
 * `getBatchStatus()` for progress.
 */
export async function createBatch(input: CreateBatchInput): Promise<BatchCreatedResult> {
  await connectMongoose();
  if (input.prompts.length === 0) {
    throw new Error('Batch must contain at least one prompt.');
  }
  if (input.prompts.length > 1000) {
    throw new Error('Batch is capped at 1000 prompts to keep generation costs sane.');
  }

  const batchId = `batch_${randomUUID()}`;
  const sessionIds: string[] = [];

  // 1. Open sessions in `pending` state (cheap — just appends to the project doc).
  for (const entry of input.prompts) {
    const session = await openSession({
      projectId: input.projectId,
      kind: input.kind,
      model: input.model,
      prompt: entry.prompt,
      systemPrompt: entry.systemPrompt,
      settings: entry.settings,
      characterId: entry.characterId,
      batchId,
    });
    sessionIds.push(session.id);
  }

  // 2. Dispatch — queue when available, inline otherwise.
  const queue = isQueueConfigured() ? getBatchQueue() : null;
  if (queue) {
    for (const sessionId of sessionIds) {
      await queue.add('run-session', {
        projectId: String(input.projectId),
        sessionId,
        kind: input.kind,
        model: input.model,
        userProfile: input.userProfile,
        userPlan: input.userPlan,
        userApiKeys: input.userApiKeys,
        costCapCents: input.costCapCents,
      } satisfies BatchJobPayload);
    }
    return { batchId, sessionIds, queued: true };
  }

  // Inline fan-out — bounded concurrency to avoid hammering provider rate limits.
  const inFlight = new Set<Promise<unknown>>();
  const CONCURRENCY = 3;
  for (const sessionId of sessionIds) {
    const project = await AiStudioProject.findById(input.projectId);
    const session = project?.sessions.find(s => s.id === sessionId);
    if (!session) continue;
    const task = runSession({
      projectId: input.projectId,
      kind: input.kind,
      model: input.model,
      prompt: session.prompt,
      systemPrompt: session.systemPrompt,
      settings: session.settings,
      characterId: session.characterId,
      batchId,
      userProfile: input.userProfile,
      userPlan: input.userPlan,
      userApiKeys: input.userApiKeys,
    } satisfies RunSessionInput).catch(err => {
      console.error('[ai-studio batch] inline session failed:', err);
    });
    inFlight.add(task);
    void task.finally(() => inFlight.delete(task));
    if (inFlight.size >= CONCURRENCY) await Promise.race(inFlight);
  }
  await Promise.allSettled(inFlight);

  return { batchId, sessionIds, queued: false };
}

export interface BatchJobPayload {
  projectId: string;
  sessionId: string;
  kind: AiStudioProjectKind;
  model: string;
  userProfile?: UserProfile | null;
  userPlan?: Plan | null;
  userApiKeys?: ApiKeys;
  costCapCents?: number;
}

export interface BatchStatus {
  batchId: string;
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  totalCostCents: number;
  sessions: IAiStudioSession[];
}

export async function getBatchStatus(
  projectId: Types.ObjectId | string,
  batchId: string
): Promise<BatchStatus> {
  await connectMongoose();
  const project = await AiStudioProject.findById(projectId);
  if (!project) throw new Error(`Project ${projectId} not found.`);
  const sessions = project.sessions.filter(s => s.batchId === batchId);
  const counts = { pending: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
  let totalCostCents = 0;
  for (const s of sessions) {
    counts[s.status] += 1;
    if (s.costCents) totalCostCents += s.costCents;
  }
  return {
    batchId,
    total: sessions.length,
    ...counts,
    totalCostCents,
    sessions,
  };
}

export async function cancelBatch(
  projectId: Types.ObjectId | string,
  batchId: string
): Promise<{ cancelled: number }> {
  await connectMongoose();
  const result = await AiStudioProject.updateOne(
    { _id: projectId },
    {
      $set: {
        'sessions.$[s].status': 'cancelled',
        'sessions.$[s].endedAt': new Date(),
      },
    },
    {
      arrayFilters: [{ 's.batchId': batchId, 's.status': { $in: ['pending', 'running'] } }],
    }
  );
  return { cancelled: result.modifiedCount ?? 0 };
}
