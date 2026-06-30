// SPDX-License-Identifier: SEE LICENSE IN LICENSE.md
// MontrAI — fair-code, licensed under the n8n Sustainable Use License (SUL). © Cloud Fold Studio.
/**
 * Client-safe telemetry policy constants + types.
 *
 * IMPORTANT: this module must stay free of server-only imports (DB/repositories,
 * Node builtins). The consent UI (`telemetry-privacy-view.tsx`, a 'use client'
 * component) imports its transparency copy from HERE — not from `flywheel.ts`,
 * which transitively reaches the Mongo driver (net/tls/child_process) and would
 * otherwise drag it into the client bundle and break `next build`.
 */

/** Bump when the wire shape changes. */
export const TELEMETRY_SCHEMA_VERSION = 1;

/**
 * Version of the privacy policy a consenting user agrees to. Bump alongside a
 * PRIVACY.md change so consent receipts (telemetry-consent.model) stay honest.
 */
export const TELEMETRY_POLICY_VERSION = '2026-06-20';

/** Plain-English transparency copy surfaced in the consent UI ("see exactly what we collect"). */
export const TELEMETRY_COLLECTED = [
    'Coarse industry vertical (one of ~15 buckets, e.g. "dtc_skincare")',
    'Goal type and which channels were used (e.g. instagram, email)',
    'Strategy shape as enums/ranges (cadence bucket, content mix)',
    'Outcome as a bucketed range (e.g. "+10-25%") — never a raw number',
    'Timeframe rounded to a bucket, and the mission template id',
    'Whether the install is cloud or self-hosted',
] as const;

export const TELEMETRY_NEVER_COLLECTED = [
    'Brand name, domain, logo, or any free-text brand identifier',
    'Message / post / email / call content',
    'Contact PII — names, emails, phone numbers, CRM records',
    'OAuth tokens, API keys, or any credentials',
    'Raw metric values that could fingerprint a brand (exact revenue/followers)',
    'Anything at all from a non-opted-in install',
] as const;

export type InstallClass = 'cloud' | 'self_host';
