import { Plan, UserProfile } from './auth/types';
import {
  ModelDefinition,
  ModelType,
  ModelTier,
  getAllBuiltInModels,
  getProviderInfo,
} from './model-groups';
import { getAllModels } from './model-registry';

/**
 * Model Access Control
 * 
 * Determines which models a user can access based on their plan and role.
 * Also handles BYOK (Bring Your Own Key) detection and routing hints.
 */

export interface ModelAccessResult {
  /** Whether the user can access this model */
  allowed: boolean;
  /** Reason for denial */
  reason?: 'upgrade_plan' | 'add_api_key' | 'insufficient_credits' | 'disabled_by_admin';
  /** Whether user is using their own API key */
  usingByok: boolean;
  /** Which provider the user has a key for (if BYOK) */
  byokProvider?: string;
}

export interface EnrichedModelDefinition extends ModelDefinition {
  /** Whether this model is disabled (user can't access) */
  isDisabled: boolean;
  /** Reason for being disabled */
  disabledReason?: 'upgrade_plan' | 'add_api_key' | 'insufficient_credits' | 'disabled_by_admin' | null;
  /** Whether user is using their own API key for this model */
  usingByok: boolean;
  /** Badge to show in UI */
  badge?: string | null;
  /** Route hint for API calls */
  routeHint?: {
    sdk: 'genkit' | 'aisdk';
    provider: string;
    keySource: 'user' | 'system';
  } | null;
}

/**
 * Get tier access levels
 * Free tier can access: free
 * Pro tier can access: free, pro
 * Enterprise tier can access: free, pro, enterprise
 */
function _getTierAccessLevel(tier: ModelTier): number {
  switch (tier) {
    case 'free': return 1;
    case 'pro': return 2;
    case 'enterprise': return 3;
  }
}

/**
 * Get user's plan tier
 */
function _getUserPlanTier(userPlan: Plan | null | undefined, userProfile: UserProfile | null | undefined): ModelTier {
  // Super admins have enterprise access
  if (userProfile?.role === 'super_admin') {
    return 'enterprise';
  }

  // Check plan features for allowed tiers
  if (userPlan?.features?.allowedModelTiers) {
    const tiers = userPlan.features.allowedModelTiers;
    if (tiers.includes('enterprise')) return 'enterprise';
    if (tiers.includes('pro')) return 'pro';
  }

  // Check by plan name (fallback)
  if (userPlan?.name?.toLowerCase().includes('enterprise')) {
    return 'enterprise';
  }
  if (userPlan?.name?.toLowerCase().includes('pro')) {
    return 'pro';
  }

  return 'free';
}

/**
 * Check if user has their own API key for a provider
 */
function hasUserApiKey(
  provider: string,
  userProfile: UserProfile | null | undefined
): boolean {
  if (!userProfile?.userApiKeys || !userProfile.canUseOwnApiKeys) {
    return false;
  }

  const providerInfo = getProviderInfo(provider);
  if (!providerInfo?.userKeyField) {
    return false;
  }

  const key = userProfile.userApiKeys[providerInfo.userKeyField];
  return !!key && key.trim().length > 0;
}

/**
 * Check if user can use BYOK for a provider
 */
function canUseByok(
  provider: string,
  userPlan: Plan | null | undefined,
  userProfile: UserProfile | null | undefined
): boolean {
  // Super admins can always use BYOK
  if (userProfile?.role === 'super_admin') {
    return true;
  }

  // Check if user has BYOK permission
  if (!userProfile?.canUseOwnApiKeys) {
    return false;
  }

  // Check plan allows BYOK for this provider
  if (userPlan?.features?.byokProviders) {
    const allowedProviders = userPlan.features.byokProviders;
    return allowedProviders.includes(provider) || allowedProviders.includes('*');
  }

  // Check general BYOK flag
  return userPlan?.features?.allowByok === true;
}

/**
 * Check if a user can access a specific model
 * Priority: User customLimits > Plan features > Defaults
 */
export function canUserAccessModel(
  model: ModelDefinition,
  userPlan: Plan | null | undefined,
  userProfile: UserProfile | null | undefined,
  userCustomLimits?: {
    allowedModelTiers?: string[];
    allowedModelTypes?: string[];
    disabledModels?: string[];
    enabledModels?: string[];
    byokProviders?: string[];
  }
): ModelAccessResult {
  // Super admins can access everything
  if (userProfile?.role === 'super_admin') {
    const usingByok = hasUserApiKey(model.provider, userProfile);
    return {
      allowed: true,
      usingByok,
      byokProvider: usingByok ? model.provider : undefined,
    };
  }

  // Check if model is explicitly disabled for this user
  if (userCustomLimits?.disabledModels?.includes(model.id)) {
    return {
      allowed: false,
      reason: 'disabled_by_admin',
      usingByok: false,
    };
  }

  // Check if model is explicitly enabled for this user (bypasses tier/type checks)
  if (userCustomLimits?.enabledModels?.includes(model.id)) {
    const usingByok = canUseByok(model.provider, userPlan, userProfile) &&
      hasUserApiKey(model.provider, userProfile);
    return {
      allowed: true,
      usingByok,
      byokProvider: usingByok ? model.provider : undefined,
    };
  }

  // Determine allowed tiers: customLimits > plan > default
  let allowedTiers: string[] = ['free'];
  if (userCustomLimits?.allowedModelTiers && userCustomLimits.allowedModelTiers.length > 0) {
    allowedTiers = userCustomLimits.allowedModelTiers;
  } else if (userPlan?.features?.allowedModelTiers) {
    allowedTiers = userPlan.features.allowedModelTiers;
  }

  // Check tier access
  if (!allowedTiers.includes(model.tier)) {
    return {
      allowed: false,
      reason: 'upgrade_plan',
      usingByok: false,
    };
  }

  // Determine allowed types: customLimits > plan > default
  let allowedTypes: string[] = ['text', 'image'];
  if (userCustomLimits?.allowedModelTypes && userCustomLimits.allowedModelTypes.length > 0) {
    allowedTypes = userCustomLimits.allowedModelTypes;
  } else if (userPlan?.features?.allowedModelTypes) {
    allowedTypes = userPlan.features.allowedModelTypes;
  }

  // Check model type access
  if (!allowedTypes.includes(model.type)) {
    return {
      allowed: false,
      reason: 'upgrade_plan',
      usingByok: false,
    };
  }

  // Check if user is using BYOK
  const usingByok = canUseByok(model.provider, userPlan, userProfile) &&
    hasUserApiKey(model.provider, userProfile);

  return {
    allowed: true,
    usingByok,
    byokProvider: usingByok ? model.provider : undefined,
  };
}

/**
 * Get route hint for a model based on user's configuration
 */
export function getRouteHint(
  model: ModelDefinition,
  userProfile: UserProfile | null | undefined,
  usingByok: boolean
): { sdk: 'genkit' | 'aisdk'; provider: string; keySource: 'user' | 'system' } | null {
  // Custom models always use OpenRouter
  if (model.isCustom) {
    return {
      sdk: 'aisdk',
      provider: 'openrouter',
      keySource: usingByok && hasUserApiKey('openrouter', userProfile) ? 'user' : 'system',
    };
  }

  // If using BYOK and model supports direct API
  if (usingByok && model.supportsDirectApi) {
    return {
      sdk: 'genkit',
      provider: model.provider,
      keySource: 'user',
    };
  }

  // Prefer Genkit for providers that support direct API (Google, OpenAI, etc.)
  // This ensures we use the native SDK for better performance and compatibility
  if (model.supportsDirectApi) {
    return {
      sdk: 'genkit',
      provider: model.provider,
      keySource: 'system',
    };
  }

  // For models that only support AI SDK, route through OpenRouter
  if (model.supportsAiSdk) {
    return {
      sdk: 'aisdk',
      provider: 'openrouter',
      keySource: 'system',
    };
  }

  return null;
}


/**
 * Get all models enriched with access information for a user
 */
export async function getModelsForUser(
  userPlan: Plan | null | undefined,
  userProfile: UserProfile | null | undefined,
  modelType?: ModelType,
  userCustomLimits?: {
    allowedModelTiers?: string[];
    allowedModelTypes?: string[];
    disabledModels?: string[];
    enabledModels?: string[];
    byokProviders?: string[];
  }
): Promise<EnrichedModelDefinition[]> {
  const allModels = await getAllModels(modelType);

  return allModels.map(model => {
    const access = canUserAccessModel(model, userPlan, userProfile, userCustomLimits);
    const routeHint = access.allowed ? getRouteHint(model, userProfile, access.usingByok) : null;

    return {
      ...model,
      isDisabled: !access.allowed,
      disabledReason: access.reason || null,
      usingByok: access.usingByok,
      badge: model.tier === 'enterprise' ? 'Enterprise' :
        model.tier === 'pro' ? 'Pro' :
          model.isCustom ? 'Custom' : null,
      routeHint,
    };
  });
}

/**
 * Get free tier models (for backward compatibility)
 */
export function getFreeModels(): Record<string, string[]> {
  const freeModels = getAllBuiltInModels().filter(m => m.tier === 'free');

  return freeModels.reduce((acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model.id);
    return acc;
  }, {} as Record<string, string[]>);
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use getModelsForUser instead
 */
export function getModelsForUserSync(
  userPlan: Plan | null | undefined,
  userProfile: UserProfile | null | undefined
) {
  const allModels = getAllBuiltInModels();

  return allModels.map(model => {
    const access = canUserAccessModel(model, userPlan, userProfile);

    return {
      ...model,
      value: model.id,
      label: model.name,
      disabled: !access.allowed,
      requiresPro: model.tier !== 'free',
    };
  });
}
