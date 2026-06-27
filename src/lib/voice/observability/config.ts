/**
 * Langfuse credential resolution for voice tracing.
 *
 * Pure: reads env defaults and merges an optional per-org override the CALLER
 * supplies (e.g. loaded from that org's integration credentials). This module
 * NEVER touches the DB — keep credential fetching in the caller so the tracer
 * stays a side-effect-free leaf. 🔒 The caller is responsible for scoping any
 * passed-in override to the right organization.
 *
 * Env: LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASEURL (optional;
 * also accepts LANGFUSE_HOST as an alias for the base URL).
 */

/** A resolved Langfuse credential set, ready to instantiate a client. */
export interface LangfuseCredentials {
  publicKey: string;
  secretKey: string;
  /** Self-hosted / region base URL; defaults to Langfuse cloud when omitted. */
  baseUrl?: string;
}

/** Optional per-call override the caller passes in (e.g. org-specific keys). */
export interface LangfuseCredentialOverride {
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
}

/** Read the env-default credential set (returns null when not configured). */
export function envLangfuseCredentials(): LangfuseCredentials | null {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) return null;
  return {
    publicKey,
    secretKey,
    baseUrl: process.env.LANGFUSE_BASEURL || process.env.LANGFUSE_HOST || undefined,
  };
}

/**
 * Merge an optional override over the env default. A complete override
 * (publicKey + secretKey) is honoured even when no env default exists, so an
 * org can opt in to tracing without a platform-wide Langfuse account.
 * Returns null when no complete credential set can be assembled.
 */
export function resolveLangfuseCredentials(
  override?: LangfuseCredentialOverride | null,
): LangfuseCredentials | null {
  const base = envLangfuseCredentials();

  const publicKey = override?.publicKey || base?.publicKey;
  const secretKey = override?.secretKey || base?.secretKey;
  if (!publicKey || !secretKey) return null;

  return {
    publicKey,
    secretKey,
    baseUrl: override?.baseUrl || base?.baseUrl,
  };
}

/** True when a complete Langfuse credential set is available (env or override). */
export function hasLangfuseCredentials(
  override?: LangfuseCredentialOverride | null,
): boolean {
  return resolveLangfuseCredentials(override) !== null;
}
