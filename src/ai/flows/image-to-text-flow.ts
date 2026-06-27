'use server';
/**
 * @fileOverview A flow to perform OCR on an image, extract text, and provide a brief analysis.
 *
 * - imageToText - A function that takes an image data URI and returns the extracted text and analysis.
 * - ImageToTextInput - The input type for the imageToText function.
 * - ImageToTextOutput - The return type for the imageToText function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ImageToTextInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of a document or scene with text, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ImageToTextInput = z.infer<typeof ImageToTextInputSchema>;

const ImageToTextOutputSchema = z.object({
  text: z.string().describe('The full, unedited text extracted from the image via OCR.'),
  analysis: z.string().describe('A brief, one-sentence analysis of the visual content of the image (objects, scene, etc.).'),
});
export type ImageToTextOutput = z.infer<typeof ImageToTextOutputSchema>;

export async function imageToText(
  input: ImageToTextInput
): Promise<ImageToTextOutput> {
  return imageToTextFlow(input);
}

const prompt = ai.definePrompt({
  name: 'imageToTextPrompt',
  input: {schema: ImageToTextInputSchema},
  output: {schema: ImageToTextOutputSchema},
  model: 'googleai/gemini-2.5-flash-lite',
  prompt: `You have two tasks.

1.  **OCR Task**: You are an expert Optical Character Recognition (OCR) system. Extract all text from the provided image. Preserve the full, unedited text. If there is no text, the 'text' field should be an empty string.
2.  **Analysis Task**: Briefly describe the visual content of the image in a single sentence. Identify key objects, the setting, or the main subject.

Return the result in the specified JSON format.

Photo: {{media url=photoDataUri}}`,
});

const imageToTextFlow = ai.defineFlow(
  {
    name: 'imageToTextFlow',
    inputSchema: ImageToTextInputSchema,
    outputSchema: ImageToTextOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input);
    return output!;
  }
);
