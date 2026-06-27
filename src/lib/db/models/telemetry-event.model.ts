import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * LOCAL sink for already-coarsened flywheel events (System B).
 *
 * This is the on-disk staging buffer the privacy spec calls "coarsen-at-source
 * → batched transmit". Events land here ONLY when consent is on and ONLY after
 * coarsening (see src/lib/telemetry/flywheel.ts). Every field below is a bucket,
 * a coarse enum, or a pseudonymous batch id — there is, by construction, no
 * brand name, no content, no PII, and no raw fingerprinting metric.
 *
 * NOTE: nothing in the OSS build transmits these anywhere. The actual cloud
 * ingestion (coarsen-at-source → k-thresholded aggregate store) is an
 * overlay/private concern; `transmitted` + the SEAM in flywheel.ts mark where
 * that hook lands. Until then this is a no-op local buffer.
 */
export interface ITelemetryEvent extends Document {
    schemaVersion: number;
    policyVersion: string;
    industryVertical: string; // coarse enum
    goalType: string; // coarse enum
    channels: string[]; // recognised-enum subset
    strategyShape: {
        cadenceBucket: string;
        contentMix?: string;
    };
    outcomeMetric: {
        kpi: string;
        deltaBucket: string; // range, never a raw value
    };
    horizonDays: number; // bucketed
    missionTemplateId?: string;
    installClass: 'cloud' | 'self_host';
    batchId: string; // rotating, salted, pseudonymous — NOT a stable user id
    recordedAt: Date;
    transmitted: boolean; // SEAM: flipped once an overlay shipper has sent it
    createdAt: Date;
    updatedAt: Date;
}

const TelemetryEventSchema = new Schema<ITelemetryEvent>(
    {
        schemaVersion: { type: Number, required: true },
        policyVersion: { type: String, required: true },
        industryVertical: { type: String, required: true },
        goalType: { type: String, required: true },
        channels: { type: [String], default: [] },
        strategyShape: {
            cadenceBucket: { type: String, required: true },
            contentMix: { type: String, default: null },
        },
        outcomeMetric: {
            kpi: { type: String, required: true },
            deltaBucket: { type: String, required: true },
        },
        horizonDays: { type: Number, required: true },
        missionTemplateId: { type: String, default: null },
        installClass: { type: String, enum: ['cloud', 'self_host'], required: true },
        batchId: { type: String, required: true, index: true },
        recordedAt: { type: Date, required: true },
        transmitted: { type: Boolean, default: false, index: true },
    },
    {
        timestamps: true,
        collection: 'telemetry_events',
    }
);

if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.TelemetryEvent) {
        delete mongoose.models.TelemetryEvent;
    }
}

const TelemetryEvent: Model<ITelemetryEvent> =
    mongoose.models.TelemetryEvent ||
    mongoose.model<ITelemetryEvent>('TelemetryEvent', TelemetryEventSchema);

export default TelemetryEvent;
