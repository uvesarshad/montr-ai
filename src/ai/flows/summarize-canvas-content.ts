'use server';
/**
 * @fileOverview This file defines a Genkit flow for summarizing canvas content.
 *
 * - summarizeCanvasContent - A function that takes canvas content as input and returns a summary.
 * - SummarizeCanvasContentInput - The input type for the summarizeCanvasContent function.
 * - SummarizeCanvasContentOutput - The return type for the summarizeCanvasContent function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const SummarizeCanvasContentInputSchema = z.object({
  canvasContent: z.string().describe('The content of the canvas to be summarized.'),
});

export type SummarizeCanvasContentInput = z.infer<typeof SummarizeCanvasContentInputSchema>;

const SummarizeCanvasContentOutputSchema = z.object({
  summary: z.string().describe('A summary of the canvas content.'),
});

export type SummarizeCanvasContentOutput = z.infer<typeof SummarizeCanvasContentOutputSchema>;

export async function summarizeCanvasContent(input: SummarizeCanvasContentInput): Promise<SummarizeCanvasContentOutput> {
  return summarizeCanvasContentFlow(input);
}

const summarizeCanvasContentPrompt = ai.definePrompt({
  name: 'summarizeCanvasContentPrompt',
  input: { schema: SummarizeCanvasContentInputSchema },
  output: { schema: SummarizeCanvasContentOutputSchema },
  prompt: `Summarize the following canvas content: {{{canvasContent}}}`,
});

const summarizeCanvasContentFlow = ai.defineFlow(
  {
    name: 'summarizeCanvasContentFlow',
    inputSchema: SummarizeCanvasContentInputSchema,
    outputSchema: SummarizeCanvasContentOutputSchema,
  },
  async input => {
    const { output } = await summarizeCanvasContentPrompt(input);
    return output!;
  }
);
