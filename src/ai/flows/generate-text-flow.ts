
'use server';

import { z } from 'genkit';
import { generateTextWithClient } from '@/ai/client';
import { ApiKeys, ApiKeysSchema, RouteHintSchema } from '@/ai/types';
// Lazy auth import — module-scope next-auth breaks the tsx worker process
// (@auth/mongodb-adapter has no CJS-resolvable export). auth() is only used
// inside functions, so it is imported on demand.
import { userRepository } from '@/lib/db/repository/user.repository';
import { planRepository } from '@/lib/db/repository/plan.repository';
import { checkAICredits, consumeAICredits } from '@/ai/credit-wrapper';

const GenerateTextInputSchema = z.object({
  context: z.string().optional().describe('The context or data to be used for the prompt.'),
  prompt: z.string().describe("The user's instruction or prompt."),
  model: z.string().describe('The AI model to use for the response (e.g., "openai/gpt-4o").'),
  // Advanced parameters
  temperature: z.number().min(0).max(2).optional().describe('Controls randomness (0-2). Lower = focused, Higher = creative.'),
  maxTokens: z.number().int().min(1).max(4096).optional().describe('Maximum length of the response.'),
  systemPrompt: z.string().optional().describe('Custom system prompt to guide the AI behavior.'),
  // optional fields (legacy/client compatibility)
  userProfile: z.any().optional(),
  userPlan: z.any().optional(),
  userApiKeys: ApiKeysSchema.optional(), // Make optional as we fetch it
  routeHint: RouteHintSchema.nullable().optional(),
});
type GenerateTextInput = z.infer<typeof GenerateTextInputSchema>;

const GenerateTextOutputSchema = z.object({
  text: z.string().describe("The AI's generated text response."),
  creditsUsed: z.number().optional().describe('Credits consumed for this request.'),
});
type GenerateTextOutput = z.infer<typeof GenerateTextOutputSchema>;

export async function generateText(input: GenerateTextInput): Promise<GenerateTextOutput> {
  const { context, prompt, model, routeHint, temperature, maxTokens, systemPrompt } = input;

  // Fetch user session/profile server-side
  const session = await (await import('@/lib/get-session')).getSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const user = await userRepository.findById(session.user.id);
  if (!user) throw new Error("User not found");

  let userPlan = null;
  // Use planId as defined in IUser interface
  const planIdToLookup = user.planId || (user as { subscriptionPlanId?: string }).subscriptionPlanId;
  if (planIdToLookup) {
    userPlan = await planRepository.findById(planIdToLookup);
  }

  // Check credits before processing
  const creditCheck = await checkAICredits(session.user.id, model);
  if (!creditCheck.allowed) {
    throw new Error(
      creditCheck.reason === 'insufficient_credits'
        ? `Insufficient credits. You need ${creditCheck.cost} credits but have ${creditCheck.remaining}.`
        : 'No active subscription. Please subscribe to use AI features.'
    );
  }

  // Use custom system prompt if provided, otherwise default
  const finalSystemPrompt = systemPrompt || "You are a helpful AI assistant. Follow the user's instructions carefully.";
  const fullPrompt = context ? `Context:\n---\n${context}\n---\n\nInstruction: ${prompt}` : prompt;

  // Determine if using BYOK
  const usingByok = routeHint?.keySource === 'user';

  try {
    const response = await generateTextWithClient({
      model,
      system: finalSystemPrompt,
      messages: [{ role: 'user', content: fullPrompt }],
      userProfile: user as unknown as Parameters<typeof generateTextWithClient>[0]['userProfile'],
      userPlan: userPlan as unknown as Parameters<typeof generateTextWithClient>[0]['userPlan'],
      userApiKeys: user.userApiKeys as ApiKeys | undefined,
      routeHint,
      temperature,
      maxTokens,
    });

    // Consume credits after successful generation
    await consumeAICredits(session.user.id, model, 'text', usingByok);

    return { text: response, creditsUsed: creditCheck.cost };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error with model ${model}:`, error);
    throw new Error(
      `The selected model '${model}' is not available or failed. Please check your API key or choose a different model. Error: ${message}`
    );
  }
}
