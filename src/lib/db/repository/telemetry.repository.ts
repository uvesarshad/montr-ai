import mongoose from 'mongoose';
import TelemetryConsent, { ITelemetryConsent } from '../models/telemetry-consent.model';
import TelemetryEvent, { ITelemetryEvent } from '../models/telemetry-event.model';

const GLOBAL_SCOPE = 'global';

/**
 * Already-coarsened event ready for the local sink. `recordedAt` accepts an ISO
 * string (the on-wire shape) or a Date — Mongoose casts either to the Date field.
 */
export interface TelemetryEventInput {
    schemaVersion: number;
    policyVersion: string;
    industryVertical: string;
    goalType: string;
    channels: string[];
    strategyShape: { cadenceBucket: string; contentMix?: string };
    outcomeMetric: { kpi: string; deltaBucket: string };
    horizonDays: number;
    missionTemplateId?: string;
    installClass: 'cloud' | 'self_host';
    batchId: string;
    recordedAt: Date | string;
}

export interface SetConsentInput {
    enabled: boolean;
    policyVersion: string;
    updatedBy?: string | null;
}

/**
 * Data access for the flywheel telemetry consent flag + the local event sink.
 * Consent is install-wide (single 'global' document); events are coarsened
 * before they ever reach `enqueueEvent`.
 */
export class TelemetryRepository {
    /** Read the consent document, or null if it has never been set (⇒ off). */
    async getConsent(scope: string = GLOBAL_SCOPE): Promise<ITelemetryConsent | null> {
        await this.ensureConnection();
        return TelemetryConsent.findOne({ scope }).exec();
    }

    /**
     * True only when an admin has explicitly opted in. Absence of a document
     * (the default state) reads as `false`.
     */
    async isEnabled(scope: string = GLOBAL_SCOPE): Promise<boolean> {
        const doc = await this.getConsent(scope);
        return Boolean(doc?.telemetryEnabled);
    }

    /** Set (and receipt) the install-wide consent flag. */
    async setConsent(
        input: SetConsentInput,
        scope: string = GLOBAL_SCOPE
    ): Promise<ITelemetryConsent> {
        await this.ensureConnection();
        const update: Record<string, unknown> = {
            telemetryEnabled: input.enabled,
            policyVersion: input.policyVersion,
            updatedBy: input.updatedBy ?? null,
        };
        // Record the consent timestamp only when turning ON (a consent receipt).
        if (input.enabled) {
            update.consentedAt = new Date();
        }
        return TelemetryConsent.findOneAndUpdate(
            { scope },
            { $set: update },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        ).exec();
    }

    /** Append one already-coarsened event to the local sink. */
    async enqueueEvent(event: TelemetryEventInput): Promise<ITelemetryEvent> {
        await this.ensureConnection();
        return TelemetryEvent.create({ ...event, transmitted: false });
    }

    private async ensureConnection(): Promise<void> {
        if (mongoose.connection.readyState !== 1) {
            const { connectMongoose } = await import('@/lib/mongodb');
            await connectMongoose();
        }
    }
}

export const telemetryRepository = new TelemetryRepository();
