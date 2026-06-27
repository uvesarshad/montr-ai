/**
 * AI Provider Router
 *
 * Takes a request context (model id, user plan, BYOK keys, optional route hint)
 * and resolves it to a concrete `ProviderClient` + `ResolvedRoute` carrying
 * the API key, base URL, and provider-specific model id.
 *
 * Selection priority (highest first):
 *   1. **BYOK** — the user supplied their own API key for the model's provider
 *   2. **Org override** — the org config selects a non-default provider (TODO: hook into org settings model)
 *   3. **Plan tier** — system keys for providers the user's plan unlocks
 *   4. **System default** — the model's native provider via the system API key
 *   5. **Free fallback** — OpenRouter free models for users on the free plan or when no key is configured
 *
 * The `routeHint` (legacy) is still honoured for backward compatibility but
 * is no longer required — when present it short-circuits the resolution.
 */

import { findModelById, ModelDefinition } from '@/lib/model-groups';
import { canUserAccessModel } from '@/lib/model-access';
import { Plan, UserProfile } from '@/lib/auth/types';
import { ApiKeys, RouteHint } from '@/ai/types';
import { getProvider } from './providers';
import {
  ProviderClient,
  ProviderId,
  ResolvedRoute,
  KeySource,
} from './providers/types';

/**
 * Map a `ModelDefinition.provider` string to a canonical `ProviderId`.
 * Returns `undefined` for providers not in our matrix (caller falls back to
 * OpenRouter or the AI-SDK long-tail provider).
 */
function providerIdFor(provider: string): ProviderId | undefined {
  const normalized = provider.toLowerCase();
  switch (normalized) {
    case 'openai': return 'openai';
    case 'anthropic': return 'anthropic';
    case 'google':
    case 'googleai':
    case 'gemini':
    case 'veo':
    case 'imagen':
      return 'google';
    case 'xai':
    case 'grok':
      return 'xai';
    case 'sarvam': return 'sarvam';
    case 'kimi':
    case 'moonshot':
      return 'kimi';
    case 'zai':
    case 'zhipu':
    case 'glm':
      return 'zai';
    case 'deepseek': return 'deepseek';
    case 'openrouter': return 'openrouter';
    // Video providers
    case 'runway':
    case 'runwayml':
      return 'runway';
    case 'pika': return 'pika';
    case 'luma':
    case 'lumalabs':
      return 'luma';
    case 'kling':
    case 'klingai':
      return 'kling';
    case 'seedance':
    case 'bytedance':
      return 'seedance';
    // Image providers
    case 'replicate': return 'replicate';
    case 'ideogram': return 'ideogram';
    // Voice provider
    case 'elevenlabs':
    case '11labs':
      return 'elevenlabs';
    // Talking-avatar providers
    case 'did':
    case 'd-id':
      return 'did';
    case 'heygen':
      return 'heygen';
    default: return undefined;
  }
}

/**
 * Long-tail providers that don't have a native SDK in our matrix but are
 * OpenAI-compatible (or close enough). When a model's provider string matches
 * one of these, the router targets `vercel-aisdk` with the appropriate
 * baseURL + the corresponding env key var. Lock-in is acknowledged here — it's
 * the "stuff we don't want to write ourselves" tier.
 */
interface LongTailEntry {
  baseURL: string;
  envVar: string;
}

const LONG_TAIL_PROVIDERS: Record<string, LongTailEntry> = {
  mistral: { baseURL: 'https://api.mistral.ai/v1', envVar: 'MISTRAL_API_KEY' },
  together: { baseURL: 'https://api.together.xyz/v1', envVar: 'TOGETHER_API_KEY' },
  fireworks: { baseURL: 'https://api.fireworks.ai/inference/v1', envVar: 'FIREWORKS_API_KEY' },
  groq: { baseURL: 'https://api.groq.com/openai/v1', envVar: 'GROQ_API_KEY' },
  perplexity: { baseURL: 'https://api.perplexity.ai', envVar: 'PERPLEXITY_API_KEY' },
  cohere: { baseURL: 'https://api.cohere.com/compatibility/v1', envVar: 'COHERE_API_KEY' },
};

function longTailEntryFor(provider: string): LongTailEntry | undefined {
  return LONG_TAIL_PROVIDERS[provider.toLowerCase()];
}

/**
 * Env var name carrying the system API key for each provider.
 */
const ENV_VAR_FOR_PROVIDER: Record<ProviderId, string> = {
  google: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  xai: 'XAI_API_KEY',
  sarvam: 'SARVAM_API_KEY',
  kimi: 'MOONSHOT_API_KEY',
  zai: 'ZAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  'vercel-aisdk': 'OPENAI_API_KEY', // long-tail uses whichever key matches the model
  // Video providers
  runway: 'RUNWAY_API_KEY',
  pika: 'PIKA_API_KEY',
  luma: 'LUMA_API_KEY',
  kling: 'KLING_API_KEY',
  seedance: 'SEEDANCE_API_KEY',
  // Image providers
  replicate: 'REPLICATE_API_KEY',
  ideogram: 'IDEOGRAM_API_KEY',
  // Voice provider
  elevenlabs: 'ELEVENLABS_API_KEY',
  // Talking-avatar providers
  did: 'DID_API_KEY',
  heygen: 'HEYGEN_API_KEY',
};

/**
 * Optional base URL override (for OpenAI-compatible endpoints).
 */
const BASE_URL_FOR_PROVIDER: Partial<Record<ProviderId, string>> = {
  xai: 'https://api.x.ai/v1',
  kimi: process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.ai/v1',
  zai: process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4',
  deepseek: 'https://api.deepseek.com/v1',
};

/**
 * Pull a user's BYOK key for a given provider.
 */
function userKeyFor(provider: ProviderId, keys: ApiKeys | undefined): string | undefined {
  if (!keys) return undefined;
  // Cast to record so we can read provider-name-matching slots that were
  // added to the schema (runway / pika / luma / kling / seedance / replicate
  // / ideogram / elevenlabs). They're optional on the zod schema so missing
  // slots simply read as `undefined`.
  const k = keys as Record<string, string | undefined>;
  switch (provider) {
    case 'google': return keys.google;
    case 'openai': return keys.openai;
    case 'anthropic': return keys.anthropic;
    case 'xai': return keys.xai;
    case 'deepseek': return keys.deepseek;
    case 'sarvam': return keys.sarvam;
    case 'kimi': return keys.kimi;
    case 'zai': return keys.zai;
    case 'openrouter': return keys.openrouter;
    case 'runway': return k.runway;
    case 'pika': return k.pika;
    case 'luma': return k.luma;
    case 'kling': return k.kling;
    case 'seedance': return k.seedance;
    case 'replicate': return k.replicate;
    case 'ideogram': return k.ideogram;
    case 'elevenlabs': return k.elevenlabs;
    case 'did': return k.did;
    case 'heygen': return k.heygen;
    default: return undefined;
  }
}

export interface ResolveRouteInput {
  /** Model id, e.g. `claude-sonnet-4-5` or `gpt-4o`. */
  model: string;
  userProfile?: UserProfile | null;
  userPlan?: Plan | null;
  userApiKeys?: ApiKeys;
  /** Legacy route hint — when present, overrides priority resolution. */
  routeHint?: RouteHint | null;
  /** Whether the caller is on the free plan tier. Used to gate to OpenRouter. */
  isFreePlan?: boolean;
}

export interface ResolveRouteResult {
  provider: ProviderClient;
  route: ResolvedRoute;
  /** The original model definition (so callers can inspect cost / capability flags). */
  modelDef: ModelDefinition;
}

/**
 * Resolve a routing decision.
 *
 * Throws if the user cannot access the model under their plan (Toll Booth),
 * or if no provider has a configured API key for the model.
 */
export function resolveRoute(input: ResolveRouteInput): ResolveRouteResult {
  const modelDef = findModelById(input.model);
  if (!modelDef) {
    throw new Error(`Model '${input.model}' not found in registry.`);
  }

  // Toll Booth — recheck plan access on the server.
  const access = canUserAccessModel(modelDef, input.userPlan, input.userProfile);
  if (!access.allowed) {
    throw new Error(access.reason || 'Model access denied.');
  }

  // 0. Legacy route hint short-circuit (preserves backward compat with old call sites).
  if (input.routeHint) {
    const hint = input.routeHint;
    const id = providerIdFor(hint.provider);
    if (!id) {
      throw new Error(`routeHint provider '${hint.provider}' is not a known provider id.`);
    }
    const apiKey = hint.keySource === 'user'
      ? userKeyFor(id, input.userApiKeys)
      : process.env[ENV_VAR_FOR_PROVIDER[id]];
    if (!apiKey) {
      throw new Error(`No ${hint.keySource} key configured for provider '${id}'.`);
    }
    return buildResult(id, apiKey, hint.keySource, modelDef);
  }

  const primaryProvider = providerIdFor(modelDef.provider);
  if (!primaryProvider) {
    // Unknown native provider — try the long-tail (AI-SDK Vercel) path before
    // falling all the way to OpenRouter.
    const longTail = longTailEntryFor(modelDef.provider);
    if (longTail) {
      return resolveLongTail(modelDef, longTail, input);
    }
    return resolveFallback(modelDef, input);
  }

  // 1. BYOK — always allowed, bypasses plan-tier provider gate.
  const byok = userKeyFor(primaryProvider, input.userApiKeys);
  if (byok) {
    return buildResult(primaryProvider, byok, 'user', modelDef);
  }

  // 2. Org override — placeholder. Wire to an org settings model when it lands.
  //    For now, fall through to plan / system.

  // 3. Plan-tier check — the user's plan must whitelist this provider for
  //    system-key access. BYOK already short-circuited above.
  assertProviderAllowedByPlan(primaryProvider, input);

  // 4. System default — the model's native provider via the env-supplied key.
  const sysKey = process.env[ENV_VAR_FOR_PROVIDER[primaryProvider]];
  if (sysKey) {
    return buildResult(primaryProvider, sysKey, 'system', modelDef);
  }

  // 5. Free fallback — OpenRouter when nothing else available.
  return resolveFallback(modelDef, input);
}

/**
 * Throw if the user's plan does not unlock the given provider for system-key
 * access. Returns silently when:
 *  - the plan is missing (treated as "no gate" — preserves dev-mode/local convenience)
 *  - the plan has no `allowedAIProviders` field (legacy plans pre-B2-3.10)
 *  - the provider is in the allowed list
 */
function assertProviderAllowedByPlan(provider: ProviderId, input: ResolveRouteInput): void {
  const plan = input.userPlan;
  if (!plan?.features) return;
  const allowed = (plan.features as { allowedAIProviders?: string[] }).allowedAIProviders;
  if (!allowed || allowed.length === 0) return;
  if (allowed.includes(provider)) return;
  throw new Error(
    `Provider '${provider}' is not unlocked by your plan ('${plan.name}'). ` +
    `Allowed providers: ${allowed.join(', ')}. Upgrade your plan or add a BYOK key.`
  );
}

function resolveLongTail(
  modelDef: ModelDefinition,
  entry: LongTailEntry,
  input: ResolveRouteInput
): ResolveRouteResult {
  // Look for a BYOK key under the provider name (Mistral / Together / Groq…).
  // Falls back to the matching env var.
  const userKey = (input.userApiKeys as Record<string, string | undefined> | undefined)
    ?.[modelDef.provider.toLowerCase()];
  const apiKey = userKey ?? process.env[entry.envVar];
  const source: KeySource = userKey ? 'user' : 'system';
  if (!apiKey) {
    // No long-tail key — fall through to OpenRouter.
    return resolveFallback(modelDef, input);
  }
  const provider = getProvider('vercel-aisdk');
  const route: ResolvedRoute = {
    provider: 'vercel-aisdk',
    sdk: provider.sdk,
    keySource: source,
    apiKey,
    baseURL: entry.baseURL,
    resolvedModelId: modelDef.id,
  };
  return { provider, route, modelDef };
}

function isFreePlanTier(input: ResolveRouteInput): boolean {
  if (input.isFreePlan === true) return true;
  if (input.isFreePlan === false) return false;
  // Default detection — fall back to inspecting the plan name.
  const name = input.userPlan?.name?.toLowerCase();
  return name === 'free' || name === 'free-tier';
}

function isFreeOpenRouterModel(modelId: string): boolean {
  // OpenRouter convention: `org/model:free` suffix marks zero-cost models.
  return modelId.toLowerCase().endsWith(':free') || modelId.toLowerCase().includes(':free');
}

function resolveFallback(modelDef: ModelDefinition, input: ResolveRouteInput): ResolveRouteResult {
  const onFreePlan = isFreePlanTier(input);

  // BYOK OpenRouter — always allowed regardless of plan tier. Free models or
  // paid models, the user paid for the key.
  const userOpenrouter = userKeyFor('openrouter', input.userApiKeys);
  if (userOpenrouter) {
    return buildResult('openrouter', userOpenrouter, 'user', modelDef);
  }

  // System OpenRouter — restricted to free plan AND free models (per the
  // locked-in decision: OpenRouter routed to free plan only).
  const sysOpenrouter = process.env.OPENROUTER_API_KEY;
  if (sysOpenrouter && onFreePlan && isFreeOpenRouterModel(modelDef.id)) {
    return buildResult('openrouter', sysOpenrouter, 'system', modelDef);
  }

  if (sysOpenrouter && !onFreePlan) {
    throw new Error(
      `Model '${modelDef.id}' has no native provider key. OpenRouter system routing ` +
      'is restricted to the free plan tier; paid users must configure a BYOK key. ' +
      'Add the relevant provider key in user settings.'
    );
  }

  if (sysOpenrouter && onFreePlan && !isFreeOpenRouterModel(modelDef.id)) {
    throw new Error(
      `Free plan can only use OpenRouter free models (id ending in ':free'). ` +
      `Model '${modelDef.id}' is paid — upgrade your plan or add a BYOK key.`
    );
  }

  throw new Error(
    `No provider configured for model '${modelDef.id}' (primary='${modelDef.provider}'). ` +
    'Set the provider env var or add a BYOK key.'
  );
}

function buildResult(
  providerId: ProviderId,
  apiKey: string,
  source: KeySource,
  modelDef: ModelDefinition
): ResolveRouteResult {
  const provider = getProvider(providerId);
  const route: ResolvedRoute = {
    provider: providerId,
    sdk: provider.sdk,
    keySource: source,
    apiKey,
    baseURL: BASE_URL_FOR_PROVIDER[providerId],
    resolvedModelId: resolveModelId(providerId, modelDef),
  };
  return { provider, route, modelDef };
}

/**
 * Translate `modelDef.id` into the model string each provider expects.
 *  - Genkit-backed providers need the `googleai/...` or `openai/...` prefix.
 *  - Native SDKs use the raw id.
 *  - OpenRouter uses `org/model` slugs (kept verbatim — the model registry
 *    stores them that way).
 */
function resolveModelId(providerId: ProviderId, modelDef: ModelDefinition): string {
  if (providerId === 'google' && !modelDef.id.startsWith('googleai/')) {
    return `googleai/${modelDef.id}`;
  }
  if (providerId === 'openai' && !modelDef.id.startsWith('openai/')) {
    return `openai/${modelDef.id}`;
  }
  return modelDef.id;
}
