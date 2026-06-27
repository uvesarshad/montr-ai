/**
 * Voice provider selection.
 *
 * Picks the right provider + credential for a given user/org/brand context.
 * Selection order:
 *   1. BYOK (user's own credential)
 *   2. Brand override (per-brand config in agency mode)
 *   3. Org override
 *   4. Plan default
 *   5. System default
 *
 * The DB lookup is injected — Phase 1 defines the interface, Phase 3 provides
 * the Mongo-backed implementation. This keeps the registry decoupled from
 * Mongoose and makes the selection logic trivially unit-testable.
 */

import { getVoiceProvider } from './registry';
import type { VoiceProvider } from './provider';
import type {
  VoiceProviderCredential,
  VoiceProviderId,
  VoiceProviderSelectionContext,
} from './types';

/** Result of a successful selection. */
export interface VoiceProviderSelection {
  provider: VoiceProvider;
  credential: VoiceProviderCredential;
  /** Where the credential came from — useful for audit/debugging. */
  source: 'byok' | 'brand' | 'org' | 'plan' | 'system';
}

/** Hooks the registry uses to ask the DB layer for a credential. */
export interface VoiceProviderConfigLookup {
  /** Per-user BYOK credential. Returns null if user has none. */
  findByokCredential(
    userId: string
  ): Promise<VoiceProviderCredential | null>;

  /** Per-brand credential override (agency mode). */
  findBrandCredential(
    brandId: string,
  ): Promise<VoiceProviderCredential | null>;

  /** Per-org credential override. */
  findOrgCredential(
): Promise<VoiceProviderCredential | null>;

  /** Plan-tier default (returns the credential the user's plan grants). */
  findPlanCredential(
    userId: string,
  ): Promise<VoiceProviderCredential | null>;

  /** System (super-admin) default credential. */
  findSystemCredential(): Promise<VoiceProviderCredential | null>;
}

let configLookup: VoiceProviderConfigLookup | null = null;

/**
 * Phase 3 calls this once at startup to wire the Mongo-backed lookup. Tests
 * call it to inject a stub.
 */
export function setVoiceProviderConfigLookup(
  lookup: VoiceProviderConfigLookup | null,
): void {
  configLookup = lookup;
}

/**
 * Resolve the provider + credential for a call. Returns null if no usable
 * credential exists — callers MUST handle this (plan gating, etc.).
 */
export async function getProviderForCall(
  ctx: VoiceProviderSelectionContext,
): Promise<VoiceProviderSelection | null> {
  if (!configLookup) {
    throw new Error(
      'Voice provider config lookup not initialized — call setVoiceProviderConfigLookup() at startup',
    );
  }

  const lookup = configLookup;

  const candidates: Array<{
    source: VoiceProviderSelection['source'];
    fetch: () => Promise<VoiceProviderCredential | null>;
  }> = [];

  if (!ctx.ignoreByok) {
    candidates.push({
      source: 'byok',
      fetch: () => lookup.findByokCredential(ctx.userId),
    });
  }

  if (ctx.brandId) {
    const brandId = ctx.brandId;
    candidates.push({
      source: 'brand',
      fetch: () => lookup.findBrandCredential(brandId),
    });
  }

  candidates.push(
    {
      source: 'org',
      fetch: () => lookup.findOrgCredential(),
    },
    {
      source: 'plan',
      fetch: () => lookup.findPlanCredential(ctx.userId),
    },
    {
      source: 'system',
      fetch: () => lookup.findSystemCredential(),
    },
  );

  for (const { source, fetch } of candidates) {
    const credential = await fetch();
    if (!credential) continue;

    const targetId: VoiceProviderId = ctx.preferredProviderId ?? credential.providerId;
    if (ctx.preferredProviderId && credential.providerId !== ctx.preferredProviderId) {
      // The candidate's credential doesn't match the preferred provider.
      // Skip it — the next candidate may have the right provider.
      continue;
    }

    const provider = getVoiceProvider(targetId);
    if (!provider) {
      // Credential references a provider we don't have an impl for. Skip.
      continue;
    }

    return { provider, credential, source };
  }

  return null;
}
