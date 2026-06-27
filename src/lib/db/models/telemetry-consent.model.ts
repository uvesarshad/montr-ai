import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Install-wide consent for the L3 flywheel telemetry (System B).
 *
 * Telemetry is OPT-IN and OFF BY DEFAULT — `telemetryEnabled` defaults to
 * `false`, and no flywheel signal is ever recorded until an admin explicitly
 * turns it on. A single document per `scope` ('global' for the typical
 * single-tenant OSS install) holds the flag plus the consent receipt
 * (timestamp + policy version) the privacy spec §5 requires.
 *
 * See docs/plan/oss-telemetry-privacy-spec-2026-06-20.md.
 */
export interface ITelemetryConsent extends Document {
    scope: string; // 'global' for the install; reserved for future per-org scoping
    telemetryEnabled: boolean; // OPT-IN, default false
    policyVersion?: string; // version of the privacy policy consented to
    consentedAt?: Date; // when consent was last granted
    updatedBy?: string; // user id who last changed the flag
    createdAt: Date;
    updatedAt: Date;
}

const TelemetryConsentSchema = new Schema<ITelemetryConsent>(
    {
        scope: {
            type: String,
            required: true,
            unique: true,
            default: 'global',
        },
        telemetryEnabled: {
            type: Boolean,
            required: true,
            default: false, // OFF BY DEFAULT — non-negotiable per spec §1
        },
        policyVersion: {
            type: String,
            default: null,
        },
        consentedAt: {
            type: Date,
            default: null,
        },
        updatedBy: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: 'telemetry_consent',
    }
);

// Prevent model recompilation in dev (matches the project convention).
if (process.env.NODE_ENV === 'development') {
    if (mongoose.models.TelemetryConsent) {
        delete mongoose.models.TelemetryConsent;
    }
}

const TelemetryConsent: Model<ITelemetryConsent> =
    mongoose.models.TelemetryConsent ||
    mongoose.model<ITelemetryConsent>('TelemetryConsent', TelemetryConsentSchema);

export default TelemetryConsent;
