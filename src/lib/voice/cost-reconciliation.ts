/**
 * Voice cost reconciliation (V-9.4).
 *
 * Reads call sessions in a window, fetches per-call price from each Twilio
 * provider config's REST API, compares with `CallSession.costAmount`, and
 * records discrepancies > threshold to the admin audit log.
 *
 * Triggered by:
 *   - `POST /api/v2/admin/voice/reconcile` (manual trigger)
 *   - A daily cron (BullMQ scheduler or external) — the entrypoint is
 *     `reconcileWindow({ since, until })` for headless use.
 */

import mongoose, { Types } from 'mongoose';
import twilio from 'twilio';

import { decryptCredential } from '@/lib/workflow/credential-encryption';
import CallSession, {
  ICallSession,
  ICallCostBreakdown,
} from '@/lib/db/models/voice/call-session.model';
import VoiceProviderConfig from '@/lib/db/models/voice/voice-provider-config.model';
import { adminAuditLogRepository } from '@/lib/db/repository/admin-audit-log.repository';

interface ReconcileOptions {
  since: Date;
  until?: Date;
  /** Discrepancy ratio above which to record an alert. Default 0.05 (5%). */
  thresholdPct?: number;
  /** Hard cap on calls processed per run — protects API rate limits. */
  maxCalls?: number;
}

interface ReconcileDiscrepancy {
  callSessionId: string;
  providerCallId: string;
  trackedCost?: number;
  actualCost?: number;
  deltaPct?: number;
  reason: string;
}

export interface ReconcileResult {
  inspected: number;
  matched: number;
  discrepancies: ReconcileDiscrepancy[];
  errors: Array<{ callSessionId: string; error: string }>;
}

async function ensureConnection(): Promise<void> {
  if (mongoose.connection.readyState !== 1) {
    const { connectMongoose } = await import('@/lib/mongodb');
    await connectMongoose();
  }
}

interface TwilioCredentials {
  accountSid: string;
  authToken: string;
}

function decodeTwilio(config: {
  encryptedValue: string;
  iv: string;
  authTag: string;
  salt: string;
  displayName: string;
  ownerUserId: Types.ObjectId;
}): TwilioCredentials | null {
  try {
    const decrypted = decryptCredential(
      {
        name: config.displayName,
        type: 'custom',
        encryptedValue: config.encryptedValue,
        iv: config.iv,
        authTag: config.authTag,
        salt: config.salt,
      },
      config.ownerUserId.toString(),
    );
    const value = decrypted.value as Partial<TwilioCredentials>;
    if (typeof value?.accountSid !== 'string' || typeof value?.authToken !== 'string') return null;
    return value as TwilioCredentials;
  } catch {
    return null;
  }
}

export async function reconcileWindow(
  options: ReconcileOptions,
): Promise<ReconcileResult> {
  await ensureConnection();
  const since = options.since;
  const until = options.until ?? new Date();
  const threshold = options.thresholdPct ?? 0.05;
  const maxCalls = options.maxCalls ?? 1000;

  const sessions = await CallSession.find({
    providerId: 'twilio',
    startedAt: { $gte: since, $lte: until },
    providerCallId: { $exists: true, $ne: null },
    durationSec: { $gt: 0 },
  })
    .limit(maxCalls)
    .exec();

  const result: ReconcileResult = {
    inspected: sessions.length,
    matched: 0,
    discrepancies: [],
    errors: [],
  };

  // Group by providerConfigId so each Twilio client is reused.
  const byConfig = new Map<string, ICallSession[]>();
  for (const s of sessions) {
    const key = s.providerConfigId?.toString() ?? '__none__';
    const list = byConfig.get(key) ?? [];
    list.push(s);
    byConfig.set(key, list);
  }

  for (const [configId, batch] of byConfig.entries()) {
    if (configId === '__none__') {
      for (const s of batch) {
        result.errors.push({
          callSessionId: s._id?.toString() ?? '',
          error: 'No providerConfigId on call session',
        });
      }
      continue;
    }
    const config = await VoiceProviderConfig.findById(configId).exec();
    if (!config) {
      for (const s of batch) {
        result.errors.push({
          callSessionId: s._id?.toString() ?? '',
          error: `Provider config ${configId} not found`,
        });
      }
      continue;
    }
    const creds = decodeTwilio(config);
    if (!creds) {
      for (const s of batch) {
        result.errors.push({
          callSessionId: s._id?.toString() ?? '',
          error: 'Twilio credential decode failed',
        });
      }
      continue;
    }
    const client = twilio(creds.accountSid, creds.authToken);

    for (const session of batch) {
      try {
        const remote = await client.calls(session.providerCallId).fetch();
        const actualCost = remote.price ? Math.abs(parseFloat(remote.price)) : undefined;
        const tracked = session.costAmount;

        if (typeof actualCost !== 'number' || Number.isNaN(actualCost)) {
          result.errors.push({
            callSessionId: session._id?.toString() ?? '',
            error: 'Twilio returned no price (call may be too recent)',
          });
          continue;
        }

        result.matched++;

        // Build the reconciled cost breakdown: keep the estimated LLM/STT/TTS
        // legs, swap telephony for Twilio's real billed figure, recompute total,
        // and flip the source to 'reconciled'. If no breakdown was estimated at
        // call end, fall back to a telephony-only reconciled breakdown.
        const prior = session.costBreakdown;
        const llm = prior?.llm ?? 0;
        const stt = prior?.stt ?? 0;
        const tts = prior?.tts ?? 0;
        const reconciledBreakdown: ICallCostBreakdown = {
          llm,
          stt,
          tts,
          telephony: actualCost,
          total: Math.round((llm + stt + tts + actualCost) * 1e6) / 1e6,
          currency: remote.priceUnit ?? 'USD',
          source: 'reconciled',
        };

        // Persist the actual cost so subsequent runs see the truth.
        await CallSession.updateOne(
          { _id: session._id },
          {
            $set: {
              costAmount: actualCost,
              costCurrency: remote.priceUnit ?? 'USD',
              costBreakdown: reconciledBreakdown,
            },
          },
        );

        if (typeof tracked !== 'number') {
          // We had no estimate, this is the first reconciliation — not a
          // discrepancy, just a backfill.
          continue;
        }

        const delta = Math.abs(actualCost - tracked);
        const deltaPct = tracked === 0 ? 1 : delta / tracked;
        if (deltaPct > threshold) {
          const disc: ReconcileDiscrepancy = {
            callSessionId: session._id?.toString() ?? '',
            providerCallId: session.providerCallId,
            trackedCost: tracked,
            actualCost,
            deltaPct,
            reason: 'tracked vs actual mismatch',
          };
          result.discrepancies.push(disc);
        }
      } catch (err) {
        result.errors.push({
          callSessionId: session._id?.toString() ?? '',
          error: err instanceof Error ? err.message : 'unknown error',
        });
      }
    }
  }

  // Record an audit entry summarizing the run.
  void adminAuditLogRepository.record({
    actorUserId: '000000000000000000000000', // system actor placeholder
    entity: 'system_setting',
    action: 'update',
    context: {
      kind: 'voice-cost-reconciliation',
      since: since.toISOString(),
      until: until.toISOString(),
      inspected: result.inspected,
      matched: result.matched,
      discrepancies: result.discrepancies.length,
      errors: result.errors.length,
    },
  });

  return result;
}
