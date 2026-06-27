/**
 * Metered Workflow AI helper
 *
 * Single entry point for EVERY AI call made from inside a workflow execution
 * (node processors + engine inline branches). It mirrors the logic in
 * `src/ai/flows/generate-text-flow.ts` — load user, check credits, route with
 * BYOK/plan, consume credits — but resolves the owning identity from the
 * EXECUTION record (`execution.userId` / `execution.organizationId`) instead of
 * `auth()`. The BullMQ worker has no NextAuth session, so any AI call that
 * relied on `auth()` threw `Unauthorized` when run from the worker; this helper
 * fixes that and makes workflow AI properly billed + BYOK-aware + plan-gated.
 *
 * Audit findings: C7 (unmetered workflow AI) + H-auth (worker auth break).
 */

import type { CoreMessage, CoreTool } from 'ai';
import { generateTextWithClient, type AIUsageInfo } from '@/ai/client';
import type { ApiKeys, RouteHint } from '@/ai/types';
import { checkAICredits, consumeAICredits } from '@/ai/credit-wrapper';
import { userRepository } from '@/lib/db/repository/user.repository';
import { planRepository } from '@/lib/db/repository/plan.repository';
import type { NodeProcessorContext } from './node-processors';

export interface MeteredAIInput {
  model: string;
  system: string;
  messages: CoreMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Real tool binding (agentic node). Provider must support tool calling. */
  tools?: Record<string, CoreTool>;
  /** Max agentic reasoning rounds when `tools` are supplied. */
  maxSteps?: number;
  /** Legacy route hint passthrough — normally left unset; router auto-detects BYOK. */
  routeHint?: RouteHint | null;
  onFinish?: (info: AIUsageInfo) => void | Promise<void>;
}

export interface MeteredAIResult {
  text: string;
  creditsUsed: number;
}

/**
 * Run a metered AI generation on behalf of the workflow's owner.
 *
 * - Identity comes from `context.execution.userId` / `organizationId`
 *   (never `auth()`, never client-supplied).
 * - Credits are checked BEFORE and consumed AFTER a successful generation.
 * - BYOK keys + plan tier are passed through so the router enforces access and
 *   bills the right key source.
 * - Charges the engine's per-run AI-call budget via `context.incrementAICall`
 *   when present (covers multi-call nodes like the agentic loop).
 */
export async function runMeteredWorkflowAI(
  context: Pick<NodeProcessorContext, 'execution' | 'incrementAICall' | 'abortSignal'>,
  input: MeteredAIInput,
): Promise<MeteredAIResult> {
  // If the run was already stopped, don't spend credits / start an AI call.
  // The AI client doesn't yet thread an AbortSignal through Genkit/Vercel, so
  // this is a pre-flight gate rather than a mid-stream abort (audit H13).
  if (context.abortSignal?.aborted) {
    throw new Error('Execution cancelled by user');
  }

  const ownerId = context.execution?.userId?.toString();
  if (!ownerId) {
    throw new Error('Workflow AI: execution has no owning userId — cannot meter AI usage.');
  }

  const user = await userRepository.findById(ownerId);
  if (!user) {
    throw new Error('Workflow AI: owning user not found.');
  }

  // Resolve plan (for tier-based provider gating in the router).
  let userPlan = null;
  const planIdToLookup = user.planId || (user as { subscriptionPlanId?: string }).subscriptionPlanId;
  if (planIdToLookup) {
    userPlan = await planRepository.findById(planIdToLookup);
  }

  // Credit gate — fail closed when the org is out of credits / has no plan.
  const creditCheck = await checkAICredits(ownerId, input.model);
  if (!creditCheck.allowed) {
    throw new Error(
      creditCheck.reason === 'insufficient_credits'
        ? `Insufficient AI credits. Need ${creditCheck.cost}, have ${creditCheck.remaining}.`
        : 'No active subscription. Subscribe to use AI features in workflows.',
    );
  }

  // Charge the per-run AI-call budget (engine ceiling) for this call.
  context.incrementAICall?.();

  const usingByok = input.routeHint?.keySource === 'user';

  try {
    const text = await generateTextWithClient({
      model: input.model,
      system: input.system,
      messages: input.messages,
      userProfile: user as unknown as Parameters<typeof generateTextWithClient>[0]['userProfile'],
      userPlan: userPlan as unknown as Parameters<typeof generateTextWithClient>[0]['userPlan'],
      userApiKeys: user.userApiKeys as ApiKeys | undefined,
      routeHint: input.routeHint,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      tools: input.tools,
      maxSteps: input.maxSteps,
      onFinish: input.onFinish,
    });

    // Bill credits after a successful generation (best-effort; never blocks).
    await consumeAICredits(ownerId, input.model, 'text', usingByok);

    return { text, creditsUsed: creditCheck.cost };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Workflow AI call failed (model ${input.model}): ${message}`);
  }
}
