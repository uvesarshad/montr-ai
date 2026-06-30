import crypto from 'crypto';
import {
    bucketCadence,
    bucketDelta,
    bucketHorizon,
    coarsenChannels,
    coarsenGoal,
    coarsenVertical,
} from './coarsen';

/**
 * L3 flywheel telemetry — the CONSENT + COLLECTION half (System B).
 *
 * Spec: docs/plan/oss-telemetry-privacy-spec-2026-06-20.md (§2A.6 seam).
 *
 * Contract enforced here:
 *   1. Telemetry is OPT-IN, OFF BY DEFAULT. `recordTelemetry` is a hard no-op
 *      unless consent has been explicitly turned on (and not killed by env).
 *   2. When on, we record COARSENED, anonymized, aggregate signals only. The
 *      coarsened event is built from a strict ALLOWLIST of buckets/enums — even
 *      if a caller hands us extra fields, brand name / content / PII / secrets /
 *      raw fingerprinting metrics CANNOT pass through (§3 never-collected list).
 *   3. The coarsened event is enqueued to a LOCAL sink. There is NO external
 *      transmit in the OSS build — the cloud ingestion endpoint is overlay/
 *      private. See the SEAM marker in `transmitBatch` below.
 */

// Pure policy constants + types live in a client-safe module so the consent UI
// can import them without pulling this server-only file (and the Mongo driver it
// reaches) into the client bundle. Re-exported here for back-compat.
import {
    TELEMETRY_SCHEMA_VERSION,
    TELEMETRY_POLICY_VERSION,
    TELEMETRY_COLLECTED,
    TELEMETRY_NEVER_COLLECTED,
    type InstallClass,
} from './policy';

export {
    TELEMETRY_SCHEMA_VERSION,
    TELEMETRY_POLICY_VERSION,
    TELEMETRY_COLLECTED,
    TELEMETRY_NEVER_COLLECTED,
};
export type { InstallClass };

/**
 * RAW outcome a caller hands in. NOTE: only the fields below are ever read.
 * Anything else on the object is ignored by construction.
 */
export interface FlywheelOutcomeInput {
    industryVertical?: string | null;
    goalType?: string | null;
    channels?: string[] | null;
    strategyShape?: {
        cadencePerWeek?: number | null;
        contentMix?: string | null;
    } | null;
    outcome: {
        kpi: string;
        deltaPercent?: number | null;
    };
    horizonDays?: number | null;
    missionTemplateId?: string | null;
}

/** The COARSENED event shape that may be persisted/transmitted. */
export interface TelemetryEventShape {
    schemaVersion: number;
    policyVersion: string;
    industryVertical: string;
    goalType: string;
    channels: string[];
    strategyShape: {
        cadenceBucket: string;
        contentMix?: string;
    };
    outcomeMetric: {
        kpi: string;
        deltaBucket: string;
    };
    horizonDays: number;
    missionTemplateId?: string;
    installClass: InstallClass;
    batchId: string;
    recordedAt: string; // ISO 8601
}

/** Read the install class from env; defaults to self-host (the OSS case). */
export function getInstallClass(): InstallClass {
    return process.env.MONTRAI_INSTALL_CLASS === 'cloud' ? 'cloud' : 'self_host';
}

/**
 * Rotating, salted, pseudonymous batch id (§4: "no re-identification join
 * keys"). Derived from a coarse day-bucket plus fresh randomness, so events
 * can't be stitched back into one brand's history and the id is not a stable
 * user identifier.
 */
export function rotatingBatchId(now: Date = new Date()): string {
    const dayBucket = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const salt = crypto.randomBytes(16).toString('hex');
    return crypto.createHash('sha256').update(`${dayBucket}:${salt}`).digest('hex').slice(0, 16);
}

/**
 * Coarsen a raw outcome into the allowlisted, anonymized event shape. PURE —
 * no consent check, no I/O. Exported for direct unit testing of the
 * coarsen-at-source guarantee.
 */
export function coarsenOutcome(
    input: FlywheelOutcomeInput,
    opts: { installClass?: InstallClass; now?: Date } = {}
): TelemetryEventShape {
    const now = opts.now ?? new Date();
    const event: TelemetryEventShape = {
        schemaVersion: TELEMETRY_SCHEMA_VERSION,
        policyVersion: TELEMETRY_POLICY_VERSION,
        industryVertical: coarsenVertical(input.industryVertical),
        goalType: coarsenGoal(input.goalType),
        channels: coarsenChannels(input.channels),
        strategyShape: {
            cadenceBucket: bucketCadence(input.strategyShape?.cadencePerWeek),
        },
        outcomeMetric: {
            // kpi is a short enum-ish label (e.g. "orders"); never free text/content.
            kpi: String(input.outcome?.kpi ?? 'unknown').slice(0, 32),
            deltaBucket: bucketDelta(input.outcome?.deltaPercent),
        },
        horizonDays: bucketHorizon(input.horizonDays),
        installClass: opts.installClass ?? getInstallClass(),
        batchId: rotatingBatchId(now),
        recordedAt: now.toISOString(),
    };
    // Optional coarse fields — only attach when present and already coarse.
    const contentMix = input.strategyShape?.contentMix;
    if (contentMix) event.strategyShape.contentMix = String(contentMix).slice(0, 32);
    if (input.missionTemplateId) event.missionTemplateId = String(input.missionTemplateId).slice(0, 64);
    return event;
}

/** Injectable seams so the no-op-when-off contract is unit-testable without a DB. */
export interface RecordTelemetryDeps {
    /** Returns whether consent is currently ON. Defaults to the DB-backed check. */
    isEnabled?: () => Promise<boolean>;
    /** Persists/forwards a coarsened event. Defaults to the local sink. */
    sink?: (event: TelemetryEventShape) => Promise<void>;
}

export interface RecordTelemetryResult {
    recorded: boolean;
    reason?: 'consent_off' | 'killed_by_env';
}

/** Env kill-switch: lets an operator force telemetry off regardless of the DB flag. */
function killedByEnv(): boolean {
    return process.env.MONTRAI_TELEMETRY_DISABLED === '1' || process.env.MONTRAI_TELEMETRY_DISABLED === 'true';
}

/** Default consent check — reads the install-wide flag from the DB. */
async function defaultIsEnabled(): Promise<boolean> {
    const { telemetryRepository } = await import('@/lib/db/repository/telemetry.repository');
    return telemetryRepository.isEnabled();
}

/** Default sink — append the coarsened event to the local staging buffer. */
async function defaultSink(event: TelemetryEventShape): Promise<void> {
    const { telemetryRepository } = await import('@/lib/db/repository/telemetry.repository');
    await telemetryRepository.enqueueEvent(event);
}

/**
 * Record one flywheel outcome.
 *
 * Hard no-op when consent is off (or the env kill-switch is set) — NOTHING is
 * coarsened, persisted, or transmitted in that case. When on, the outcome is
 * coarsened at source and handed to the local sink. Never throws into the
 * caller's path: telemetry must never break business logic.
 */
export async function recordTelemetry(
    input: FlywheelOutcomeInput,
    deps: RecordTelemetryDeps = {}
): Promise<RecordTelemetryResult> {
    try {
        if (killedByEnv()) return { recorded: false, reason: 'killed_by_env' };

        const isEnabled = deps.isEnabled ?? defaultIsEnabled;
        const enabled = await isEnabled();
        if (!enabled) return { recorded: false, reason: 'consent_off' };

        const event = coarsenOutcome(input);
        const sink = deps.sink ?? defaultSink;
        await sink(event);
        return { recorded: true };
    } catch {
        // Telemetry is best-effort and must never throw into business logic.
        return { recorded: false };
    }
}

/**
 * ───────────────────────────── SEAM (DO NOT WIRE IN OSS) ─────────────────────
 * Batched transmit to the cloud flywheel ingestion endpoint lives in the
 * PRIVATE/overlay build, NOT here. The OSS tree only stages coarsened events in
 * the local sink (above). The cloud overlay is responsible for:
 *   - reading un-transmitted events from the local sink,
 *   - POSTing them to the (private) ingestion endpoint over safeOutboundFetch,
 *   - k-thresholding (k=25) + suppression in the aggregate store, then
 *   - flipping `transmitted` on the local rows.
 * This stub intentionally does nothing so the OSS build never phones home.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function transmitBatch(): Promise<{ sent: number }> {
    // No external send in OSS. See SEAM note above.
    return { sent: 0 };
}
