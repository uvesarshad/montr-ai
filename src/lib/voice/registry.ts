/**
 * Voice provider registry.
 *
 * - Concrete providers register themselves at module load by calling
 *   `registerVoiceProvider(impl)`.
 * - Callers obtain a provider for a given user/org context via
 *   `getProviderForCall(...)`, which also returns the credential to use.
 *
 * Selection order (first hit wins):
 *   1. **BYOK** — the user has their own provider credential saved on
 *      `voice-provider-config` (per-user scope).
 *   2. **Brand override** — the active brand has its own provider configured.
 *   3. **Org override** — the organization has selected a default provider.
 *   4. **Plan default** — the user's plan tier maps to a provider.
 *   5. **System default** — the super-admin's `system` provider config.
 *
 * The registry is intentionally tiny — selection logic lives in
 * `selectProviderConfig`, which lives in the repository layer (Phase 3) so it
 * can query MongoDB. This file only knows about in-process provider classes.
 */

import type { VoiceProvider } from './provider';
import type { VoiceProviderId } from './types';

const providers = new Map<VoiceProviderId, VoiceProvider>();

/** Register a provider implementation. Called from each provider module. */
export function registerVoiceProvider(impl: VoiceProvider): void {
  if (providers.has(impl.id)) {
    throw new Error(
      `Voice provider "${impl.id}" registered twice — registry must be unique`,
    );
  }
  providers.set(impl.id, impl);
}

/** Returns the registered provider implementation by id, or null. */
export function getVoiceProvider(id: VoiceProviderId): VoiceProvider | null {
  return providers.get(id) ?? null;
}

/** Returns all registered provider implementations (used by admin UI). */
export function listVoiceProviders(): VoiceProvider[] {
  return Array.from(providers.values());
}

/**
 * @internal — for tests only. Resets the in-process registry so each test can
 * register a fresh set of mock providers without leaking across files.
 */
export function __resetVoiceProviderRegistryForTests(): void {
  providers.clear();
}
