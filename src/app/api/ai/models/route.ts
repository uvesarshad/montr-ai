

import { NextResponse } from 'next/server';
import { getModelsForUser } from '@/lib/model-access';
import { loadPlan, loadUserProfile } from '@/lib/auth/auth';
import { UserProfile, Plan } from '@/lib/auth/types';
import { getSession } from '@/lib/get-session';
import { ModelType } from '@/lib/model-groups';
import { checkCredits } from '@/lib/credit-service';

/**
 * GET /api/ai/models
 * 
 * Returns the list of available AI models for the current user.
 * Models are filtered based on the user's plan and enriched with:
 * - Disabled status (if user can't access)
 * - BYOK indicator (if using user's own API key)
 * - Credit cost
 * - Route hints for API calls
 */

async function getAuthenticatedUser(): Promise<{
  userProfile: UserProfile | null;
  userPlan: Plan | null;
  customLimits?: {
    allowedModelTiers?: string[];
    allowedModelTypes?: string[];
    disabledModels?: string[];
    enabledModels?: string[];
    byokProviders?: string[];
  };
}> {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return { userProfile: null, userPlan: null };
    }

    const userProfile = await loadUserProfile(session.user.id!);

    if (!userProfile) {
      return { userProfile: null, userPlan: null };
    }

    // Extract customLimits from userProfile if available
    const customLimits = userProfile.customLimits as {
      allowedModelTiers?: string[];
      allowedModelTypes?: string[];
      disabledModels?: string[];
      enabledModels?: string[];
      byokProviders?: string[];
    } | undefined;

    // Super admins have full access
    if (userProfile.role === 'super_admin') {
      return { userProfile, userPlan: null };
    }

    // Load user's plan
    // @ts-expect-error
    if (userProfile.subscriptionPlanId) {
      // @ts-expect-error
      const userPlan = await loadPlan(userProfile.subscriptionPlanId);
      return { userProfile, userPlan, customLimits };
    }

    return { userProfile, userPlan: null, customLimits };

  } catch (error) {
    console.error("Error retrieving authenticated user:", error);
    return { userProfile: null, userPlan: null };
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const modelType = searchParams.get('type') as ModelType | null;

    const { userProfile, userPlan, customLimits } = await getAuthenticatedUser();

    // Get models filtered and enriched for this user
    const models = await getModelsForUser(userPlan, userProfile, modelType || undefined, customLimits);

    // Get user's remaining credits for display
    let remainingCredits: number | null = null;
    if (userProfile?.id) {
      try {
        const creditCheck = await checkCredits(userProfile.id, 'text'); // Check with a generic model
        remainingCredits = creditCheck.remaining;
      } catch (_e) {
        // Credit system not set up yet - that's okay
        remainingCredits = null;
      }
    }

    // Group models by provider for UI
    const groupedModels = models.reduce((acc, model) => {
      const providerName = model.provider.charAt(0).toUpperCase() + model.provider.slice(1);
      if (!acc[providerName]) {
        acc[providerName] = {
          label: providerName,
          models: [],
        };
      }
      acc[providerName].models.push({
        id: model.id,
        name: model.name,
        provider: model.provider,
        type: model.type,
        creditCost: model.creditCost,
        isAvailable: !model.isDisabled,
        isDisabled: model.isDisabled,
        usingByok: model.usingByok,
        badge: model.badge,
        disabledReason: model.disabledReason,
        routeHint: model.routeHint,
        isCustom: model.isCustom || false,
        capabilities: model.capabilities || [],
      });
      return acc;
    }, {} as Record<string, { label: string; models: Record<string, unknown>[] }>);

    // Convert to array format expected by frontend
    const response = Object.values(groupedModels);

    return NextResponse.json({
      models: response,
      remainingCredits,
      userRole: userProfile?.role || 'guest',
      canUseByok: userProfile?.canUseOwnApiKeys || false,
    });
  } catch (error) {
    console.error('Error in /api/ai/models:', error);
    return NextResponse.json({ error: 'Failed to load models.' }, { status: 500 });
  }
}
