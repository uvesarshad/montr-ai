'use server';

/**
 * @fileOverview A flow that suggests improvements to a canvas design based on its current state.
 *
 * @exports suggestCanvasImprovements - The main function to trigger the suggestion flow.
 * @exports SuggestCanvasImprovementsInput - The input type for the suggestCanvasImprovements function.
 * @exports SuggestCanvasImprovementsOutput - The output type for the suggestCanvasImprovements function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestCanvasImprovementsInputSchema = z.object({
  canvasState: z.string().describe('The current state of the canvas in JSON format, including elements and their properties.'),
  userGoal: z.string().describe('The user goal or purpose for the canvas.'),
});
export type SuggestCanvasImprovementsInput = z.infer<typeof SuggestCanvasImprovementsInputSchema>;

const SuggestCanvasImprovementsOutputSchema = z.object({
  suggestions: z.array(
    z.string().describe('A list of suggestions for improving the canvas design.')
  ).describe('Suggestions for improving the canvas design based on the current state and user goal.'),
});
export type SuggestCanvasImprovementsOutput = z.infer<typeof SuggestCanvasImprovementsOutputSchema>;

export async function suggestCanvasImprovements(input: SuggestCanvasImprovementsInput): Promise<SuggestCanvasImprovementsOutput> {
  return suggestCanvasImprovementsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestCanvasImprovementsPrompt',
  input: {schema: SuggestCanvasImprovementsInputSchema},
  output: {schema: SuggestCanvasImprovementsOutputSchema},
  prompt: `You are an AI assistant that analyzes canvas designs and suggests improvements.

  Analyze the current canvas state and the user's goal, then provide a list of specific suggestions for improving the canvas design.
  The suggestions should be actionable and relevant to the user's goal.

  Canvas State: {{{canvasState}}}
  User Goal: {{{userGoal}}}

  Suggestions (as a JSON array of strings):`,
});

const suggestCanvasImprovementsFlow = ai.defineFlow(
  {
    name: 'suggestCanvasImprovementsFlow',
    inputSchema: SuggestCanvasImprovementsInputSchema,
    outputSchema: SuggestCanvasImprovementsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
