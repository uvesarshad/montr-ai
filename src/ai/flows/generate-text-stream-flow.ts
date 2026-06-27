
'use server';

import { z } from 'genkit';
import { streamTextWithClient } from '@/ai/client';
import { ApiKeysSchema, RouteHintSchema } from '@/ai/types';

const GenerateTextStreamInputSchema = z.object({
  context: z.string().optional().describe('The context or data to be used for the prompt.'),
  prompt: z.string().describe("The user's instruction or prompt."),
  model: z.string().describe('The AI model to use for the response (e.g., "openai/gpt-4o").'),
  userProfile: z.any().optional(),
  userPlan: z.any().optional(),
  userApiKeys: ApiKeysSchema,
  routeHint: RouteHintSchema.nullable().optional(),
});
type GenerateTextStreamInput = z.infer<typeof GenerateTextStreamInputSchema>;

export async function generateTextStream(input: GenerateTextStreamInput): Promise<AsyncGenerator<string>> {
  const { context, prompt, model, userProfile, userPlan, userApiKeys, routeHint } = input;

  const systemMessage = 'You are a helpful AI assistant. Follow the user\'s instructions carefully.';
  const fullPrompt = context ? `Context:\n---\n${context}\n---\n\nInstruction: ${prompt}` : prompt;

  try {
    return streamTextWithClient({
      model,
      system: systemMessage,
      messages: [{ role: 'user', content: fullPrompt }],
      userProfile,
      userPlan,
      userApiKeys,
      routeHint,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Streaming Error] Model: ${model}`, error);
    const errorMessage = `Failed to stream from model '${model}'. Details: ${message}`;
    throw new Error(errorMessage);
  }
}
