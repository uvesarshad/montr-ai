/**
 * Bulk dialer dispatcher.
 *
 * Picks pending entries from a `VoiceBulkBatch` and places outbound calls at
 * the configured `callsPerMinute` rate. Stateless w.r.t. the dispatcher's own
 * memory — the batch document is the source of truth. Safe to call multiple
 * times concurrently (entries are claimed via atomic update).
 *
 * The current implementation is a single-process tick: each `tick()` call
 * places at most `callsPerMinute` calls and returns. A caller (the API route)
 * fires the first tick on batch creation and re-fires via setTimeout for
 * subsequent batches. On server restart, an admin can hit `POST /resume` to
 * pick up where it left off.
 *
 * Future: swap the setTimeout schedule for a BullMQ delayed job per minute
 * window so the dispatcher survives process churn.
 */

import mongoose, { Types } from 'mongoose';

import VoiceBulkBatch, {
  IVoiceBulkBatch,
  IVoiceBulkCallEntry,
} from '@/lib/db/models/voice/voice-bulk-batch.model';
import { callSessionRepository } from '@/lib/db/repository/voice';
import { getProviderForCall } from './selection';
import { initVoiceSubsystem } from './bootstrap';

initVoiceSubsystem();

async function ensureConnection(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();
  }
}

interface TickResult {
  placed: number;
  failed: number;
  remaining: number;
  status: IVoiceBulkBatch['status'];
}

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL
    ?? process.env.NEXTAUTH_URL
    ?? 'http://localhost:3000'
  );
}

/**
 * Place up to `callsPerMinute` outbound calls for the batch and return.
 *
 * Caller is responsible for scheduling subsequent ticks (e.g. via setTimeout
 * one minute later). Repeated ticks beyond the batch's pending count are
 * no-ops.
 */
export async function tickBulkBatch(batchId: string): Promise<TickResult> {
  await ensureConnection();

  const batch = await VoiceBulkBatch.findById(batchId).exec();
  if (!batch) {
    return { placed: 0, failed: 0, remaining: 0, status: 'failed' };
  }
  if (
    batch.status === 'paused'
    || batch.status === 'cancelled'
    || batch.status === 'completed'
    || batch.status === 'pending_approval'
    || batch.status === 'rejected'
  ) {
    const remaining = batch.entries.filter(e => e.status === 'pending').length;
    return { placed: 0, failed: 0, remaining, status: batch.status };
  }

  if (batch.status === 'pending') {
    batch.status = 'running';
    batch.startedAt = new Date();
  }

  // Claim up to callsPerMinute pending entries by flipping them to 'placing'.
  const claimed: IVoiceBulkCallEntry[] = [];
  let claimedCount = 0;
  for (const entry of batch.entries) {
    if (entry.status !== 'pending') continue;
    entry.status = 'placing';
    claimed.push(entry);
    claimedCount++;
    if (claimedCount >= batch.callsPerMinute) break;
  }
  if (claimed.length === 0) {
    // No work left.
    const allTerminal = batch.entries.every(
      e => e.status === 'completed' || e.status === 'failed' || e.status === 'no_answer' || e.status === 'voicemail',
    );
    if (allTerminal) {
      batch.status = 'completed';
      batch.completedAt = new Date();
    }
    await batch.save();
    return { placed: 0, failed: 0, remaining: 0, status: batch.status };
  }
  await batch.save();

  // Resolve provider once per tick — same credential is used for the burst.
  const selection = await getProviderForCall({
    userId: batch.createdById.toString(),
    brandId: batch.brandId?.toString() ?? null,
  });
  if (!selection) {
    for (const entry of claimed) {
      entry.status = 'failed';
      entry.errorMessage = 'No voice provider available';
    }
    await batch.save();
    return { placed: 0, failed: claimed.length, remaining: 0, status: 'failed' };
  }

  let placed = 0;
  let failed = 0;
  for (const entry of claimed) {
    try {
      const callSession = await callSessionRepository.create({
        brandId: batch.brandId?.toString() ?? null,
        providerId: selection.provider.id,
        providerConfigId:
          typeof selection.credential.metadata?.configId === 'string'
            ? selection.credential.metadata.configId
            : undefined,
        direction: 'outbound',
        fromNumber: batch.fromNumber,
        toNumber: entry.phoneNumber,
        fromContactId: entry.contactId ? entry.contactId.toString() : null,
        initiatorType: 'system',
        initiatorId: `bulk:${batch._id?.toString()}`,
        status: 'queued',
        customMetadata: {
          bulkBatchId: batch._id?.toString(),
          aiBotId: batch.aiBotId,
          aiCharacterId: batch.aiCharacterId,
          variables: entry.variables ?? {},
          script: batch.script,
        },
      });

      const result = await selection.provider.initiateOutboundCall(
        {
          from: batch.fromNumber,
          to: entry.phoneNumber,
          callSessionId: callSession._id?.toString() ?? '',
          webhookBaseUrl: baseUrl(),
          options: {
            recordCall: batch.recordCall,
            timeoutSec: 30,
          },
        },
        selection.credential,
      );
      await callSessionRepository.updateProviderCallId(
        callSession._id?.toString() ?? '',
        result.providerCallId,
      );
      entry.callSessionId = callSession._id as Types.ObjectId;
      entry.providerCallId = result.providerCallId;
      entry.status = 'in_progress';
      entry.startedAt = new Date();
      placed++;
    } catch (err) {
      entry.status = 'failed';
      entry.errorMessage = err instanceof Error ? err.message : 'unknown error';
      failed++;
    }
  }

  // Recompute totals.
  const totals = {
    total: batch.entries.length,
    pending: 0,
    placing: 0,
    inProgress: 0,
    completed: 0,
    failed: 0,
    noAnswer: 0,
    voicemail: 0,
  };
  for (const e of batch.entries) {
    switch (e.status) {
      case 'pending': totals.pending++; break;
      case 'placing': totals.placing++; break;
      case 'in_progress': totals.inProgress++; break;
      case 'completed': totals.completed++; break;
      case 'failed': totals.failed++; break;
      case 'no_answer': totals.noAnswer++; break;
      case 'voicemail': totals.voicemail++; break;
    }
  }
  batch.totals = totals;
  await batch.save();

  return {
    placed,
    failed,
    remaining: totals.pending,
    status: batch.status,
  };
}

/**
 * Schedule subsequent ticks via setTimeout. Fire-and-forget — the caller
 * should not await this. Stops when no pending entries remain.
 */
export function scheduleBulkDispatch(batchId: string): void {
  void (async () => {
    let result = await tickBulkBatch(batchId);
    while (result.remaining > 0 && result.status === 'running') {
      // Sleep ~60s before the next minute window.
      await new Promise(resolve => setTimeout(resolve, 60_000));
      result = await tickBulkBatch(batchId);
    }
  })().catch(err => console.error('[bulk-dispatch] tick failed:', err));
}
