'use server';
/**
 * @fileOverview A flow to summarize a chat conversation.
 *
 * - summarizeChatHistory - A function that takes a history and returns a concise summary.
 * - SummarizeChatHistoryInput - The input type for the summarizeChatHistory function.
 * - SummarizeChatHistoryOutput - The return type for the summarizeChatHistory function.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { AISettingsService } from '@/lib/services/ai-settings.service';
import { generateTextWithClient } from '@/ai/client';

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

const SummarizeChatHistoryInputSchema = z.object({
  history: z
    .array(MessageSchema)
    .describe('The conversation history to be summarized.'),
  currentSummary: z
    .string()
    .optional()
    .describe('An existing summary to be updated and built upon.'),
  userId: z.string().optional().describe('The user ID to fetch AI preferences for.'),
});
export type SummarizeChatHistoryInput = z.infer<
  typeof SummarizeChatHistoryInputSchema
>;

const SummarizeChatHistoryOutputSchema = z.object({
  summary: z.string().describe('A concise, 3-4 sentence summary of the key points and context from the conversation.'),
});
export type SummarizeChatHistoryOutput = z.infer<
  typeof SummarizeChatHistoryOutputSchema
>;

export async function summarizeChatHistory(
  input: SummarizeChatHistoryInput
): Promise<SummarizeChatHistoryOutput> {
  return summarizeChatHistoryFlow(input);
}

const summarizeChatHistoryFlow = ai.defineFlow(
  {
    name: 'summarizeChatHistoryFlow',
    inputSchema: SummarizeChatHistoryInputSchema,
    outputSchema: SummarizeChatHistoryOutputSchema,
  },
  async input => {
    // 1. Get Preferred Model & Route Hint
    const preference = await AISettingsService.getPreferredModel(input.userId, 'summarization');
    // For Genkit models, we use provider/modelId. For others, just modelId might suffice but client.ts handles it.
    // client.ts expects the model ID as it appears in model-groups.ts (e.g. 'gpt-4o', 'gemini-1.5-flash')
    // But AISettingsService writes { modelId: 'gemini-1.5-flash', providerId: 'google' }
    // The `model` arg for generateTextWithClient expects the `id` from model-groups.
    const modelId = preference.modelId;

    // 2. Construct Prompt
    const systemPrompt = `You are an expert at summarizing conversations. Distill the following chat history into a concise, 3-4 sentence summary. The goal is to capture the key points, user intent, and important context.`;

    let userPrompt = ``;
    if (input.currentSummary) {
      userPrompt += `Existing summary:\n${input.currentSummary}\n\n`;
    }
    userPrompt += `Chat history:\n`;
    input.history.forEach(msg => {
      userPrompt += `${msg.role}: ${msg.content}\n`;
    });
    userPrompt += `\nGenerate the new summary.`;

    // 3. Generate using Unified Client
    const summaryText = await generateTextWithClient({
      model: modelId,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      routeHint: preference.routeHint,
      // We can pass userId to handle BYOK if implemented in client.ts
      // client.ts signature: userProfile? 
    });

    return { summary: summaryText };
  }
);
