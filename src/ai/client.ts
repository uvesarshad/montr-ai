'use server';

import { CoreMessage, CoreTool } from 'ai';
import { Plan, UserProfile } from '@/lib/auth/types';
import { ApiKeys, RouteHint } from '@/ai/types';
import { resolveRoute } from './router';
import { AIUsageInfo as ProviderUsage } from './providers/types';

/**
 * Backward-compatible AI client surface.
 *
 * Behind the scenes this delegates to the provider registry (`src/ai/providers/`)
 * via the router (`src/ai/router.ts`). The old `routeHint` field still works —
 * when present it short-circuits resolution and forces the named provider /
 * key source. When absent the router picks via the standard priority chain:
 * BYOK → org override → plan tier → system default → OpenRouter fallback.
 */

export interface AIUsageInfo {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  finishReason?: string;
}

interface CommonGenerationInput {
  model: string;
  system: string;
  messages: CoreMessage[];
  userProfile?: UserProfile | null;
  userPlan?: Plan | null;
  userApiKeys?: ApiKeys;
  routeHint?: RouteHint | null;
  temperature?: number;
  maxTokens?: number;
  tools?: Record<string, CoreTool>;
  maxSteps?: number;
  onFinish?: (info: AIUsageInfo) => void | Promise<void>;
}

function toLegacyUsage(usage: ProviderUsage | undefined): AIUsageInfo {
  if (!usage) return {};
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    finishReason: usage.finishReason,
  };
}

/**
 * Observability for tool binding (2026-06-06). Agent turns depend on the
 * resolved provider ACTUALLY binding `tools` — the genkit-based providers
 * flatten prompts and silently drop them, which makes models roleplay tool
 * calls. Log every tool-carrying call's route, and warn loudly when the
 * provider can't bind.
 */
function logToolBinding(
  op: string,
  provider: { id: string; capabilities: { toolCalling: boolean } },
  route: { resolvedModelId: string; keySource: string },
  input: CommonGenerationInput,
): void {
  const toolCount = input.tools ? Object.keys(input.tools).length : 0;
  if (toolCount === 0) return;
  console.log(`[AI Client] ${op} via ${provider.id} (model=${route.resolvedModelId}, key=${route.keySource}) tools=${toolCount} maxSteps=${input.maxSteps ?? 1}`);
  if (!provider.capabilities.toolCalling) {
    console.warn(`[AI Client] Provider '${provider.id}' does NOT bind tools — ${toolCount} tools will be IGNORED and the model will roleplay tool use. Route this task to a tool-capable provider (anthropic/openai/openrouter).`);
  }
}

/**
 * Generate text via the provider router. The model id, plan, and BYOK keys
 * are passed straight through; the router does access checks (Toll Booth)
 * and picks the right provider.
 */
export async function generateTextWithClient(input: CommonGenerationInput): Promise<string> {
  const { provider, route } = resolveRoute({
    model: input.model,
    userProfile: input.userProfile,
    userPlan: input.userPlan,
    userApiKeys: input.userApiKeys,
    routeHint: input.routeHint,
  });
  logToolBinding('generateText', provider, route, input);

  try {
    const result = await provider.generateText({
      route,
      system: input.system,
      messages: input.messages,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      tools: input.tools,
      maxSteps: input.maxSteps,
      // Default prompt caching on for providers that support it (Anthropic).
      enablePromptCaching: provider.capabilities.promptCaching,
      onFinish: input.onFinish
        ? (u) => input.onFinish!(toLegacyUsage(u))
        : undefined,
    });
    return result.text;
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401 || err.status === 403) {
      throw new Error(
        `Authentication failed for model ${input.model}. The provided API key may be invalid or lack permissions.`
      );
    }
    throw error;
  }
}

/**
 * Stream text via the provider router.
 */
export async function streamTextWithClient(input: CommonGenerationInput): Promise<AsyncGenerator<string>> {
  const { provider, route } = resolveRoute({
    model: input.model,
    userProfile: input.userProfile,
    userPlan: input.userPlan,
    userApiKeys: input.userApiKeys,
    routeHint: input.routeHint,
  });
  logToolBinding('streamText', provider, route, input);

  try {
    return await provider.streamText({
      route,
      system: input.system,
      messages: input.messages,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      tools: input.tools,
      maxSteps: input.maxSteps,
      enablePromptCaching: provider.capabilities.promptCaching,
      onFinish: input.onFinish
        ? (u) => input.onFinish!(toLegacyUsage(u))
        : undefined,
    });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401 || err.status === 403) {
      throw new Error(
        `Authentication failed for model ${input.model}. The provided API key may be invalid or lack permissions.`
      );
    }
    throw error;
  }
}
