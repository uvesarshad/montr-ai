/**
 * Flywheel telemetry — consent + coarsen-at-source guarantees.
 *
 * Pure unit tests (no DB/Redis): consent and the local sink are injected as
 * fakes so we can assert the off-by-default no-op contract and that what DOES
 * get recorded is fully coarsened (no raw values / forbidden fields).
 */
import { it, expect, vi, afterEach } from 'vitest';
import {
    recordTelemetry,
    coarsenOutcome,
    type FlywheelOutcomeInput,
    type TelemetryEventShape,
} from './flywheel';

const SAMPLE: FlywheelOutcomeInput = {
    industryVertical: 'DTC Skincare',
    goalType: 'grow_orders',
    channels: ['instagram', 'email', 'totally-unknown-channel'],
    strategyShape: { cadencePerWeek: 5, contentMix: 'ugc_heavy' },
    outcome: { kpi: 'orders', deltaPercent: 18.4 },
    horizonDays: 88,
    missionTemplateId: 'campaign-launch',
};

afterEach(() => {
    delete process.env.MONTRAI_TELEMETRY_DISABLED;
    vi.restoreAllMocks();
});

// ─── The headline guarantee: nothing recorded when consent is OFF ────────────

it('[telemetry] records NOTHING when consent is off', async () => {
    const sink = vi.fn(async () => {});
    const res = await recordTelemetry(SAMPLE, { isEnabled: async () => false, sink });

    expect(sink).not.toHaveBeenCalled();
    expect(res.recorded).toBe(false);
    expect(res.reason).toBe('consent_off');
});

it('[telemetry] env kill-switch forces a no-op even if consent would be on', async () => {
    process.env.MONTRAI_TELEMETRY_DISABLED = '1';
    const sink = vi.fn(async () => {});
    const res = await recordTelemetry(SAMPLE, { isEnabled: async () => true, sink });

    expect(sink).not.toHaveBeenCalled();
    expect(res.recorded).toBe(false);
    expect(res.reason).toBe('killed_by_env');
});

// ─── When consent is ON, a single coarsened event reaches the sink ───────────

it('[telemetry] records a coarsened event when consent is on', async () => {
    const captured: TelemetryEventShape[] = [];
    const sink = vi.fn(async (e: TelemetryEventShape) => {
        captured.push(e);
    });

    const res = await recordTelemetry(SAMPLE, { isEnabled: async () => true, sink });

    expect(res.recorded).toBe(true);
    expect(sink).toHaveBeenCalledTimes(1);
    const e = captured[0];

    // Coarsened: ranges/enums, not raw values.
    expect(e.outcomeMetric.deltaBucket).toBe('+10-25%');
    expect(e.industryVertical).toBe('dtc_skincare');
    expect(e.strategyShape.cadenceBucket).toBe('high');
    expect(e.horizonDays).toBe(90); // 88 snaps to the 90 bucket

    // Unknown channel dropped, recognised ones kept + sorted.
    expect(e.channels).toEqual(['email', 'instagram']);

    // The raw +18.4 must NOT appear anywhere in the serialized payload.
    expect(JSON.stringify(e)).not.toContain('18.4');
});

// ─── Forbidden fields can never pass through the allowlist ────────────────────

it('[telemetry] never forwards brand name / content / PII even if a caller leaks them', async () => {
    const captured: TelemetryEventShape[] = [];
    const sink = vi.fn(async (e: TelemetryEventShape) => {
        captured.push(e);
    });

    const leaky = {
        ...SAMPLE,
        brandName: 'Acme Cosmetics',
        contactEmail: 'jane@example.com',
        messageContent: 'Hey, check out our new serum!',
        apiKey: 'sk-secret-123',
    } as unknown as FlywheelOutcomeInput;

    await recordTelemetry(leaky, { isEnabled: async () => true, sink });

    const serialized = JSON.stringify(captured[0]);
    expect(serialized).not.toContain('Acme');
    expect(serialized).not.toContain('jane@example.com');
    expect(serialized).not.toContain('serum');
    expect(serialized).not.toContain('sk-secret-123');
});

// ─── coarsenOutcome unanonymized-input edge cases (pure) ─────────────────────

it('[telemetry] unknown vertical/goal collapse to "other"', () => {
    const e = coarsenOutcome({
        industryVertical: 'underwater-basket-weaving',
        goalType: 'become-famous',
        outcome: { kpi: 'x' },
    });
    expect(e.industryVertical).toBe('other');
    expect(e.goalType).toBe('other');
});

it('[telemetry] negative and flat deltas bucket correctly', () => {
    expect(coarsenOutcome({ outcome: { kpi: 'k', deltaPercent: -5 } }).outcomeMetric.deltaBucket).toBe('down');
    expect(coarsenOutcome({ outcome: { kpi: 'k', deltaPercent: 0 } }).outcomeMetric.deltaBucket).toBe('flat');
    expect(coarsenOutcome({ outcome: { kpi: 'k', deltaPercent: 250 } }).outcomeMetric.deltaBucket).toBe('+100%+');
});

it('[telemetry] batchId is pseudonymous and rotates per event (not a stable id)', () => {
    const a = coarsenOutcome({ outcome: { kpi: 'k' } });
    const b = coarsenOutcome({ outcome: { kpi: 'k' } });
    expect(a.batchId).not.toBe(b.batchId);
    expect(a.batchId).toMatch(/^[0-9a-f]{16}$/);
});
