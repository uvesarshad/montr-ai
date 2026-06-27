'use server';
/**
 * @fileOverview A flow to transcribe audio from a public YouTube video.
 *
 * - transcribeVideo - A function that takes a YouTube video URL and returns a text transcript.
 * - TranscribeVideoInput - The input type for the transcribeVideo function.
 * - TranscribeVideoOutput - The return type for the transcribeVideo function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { YoutubeTranscript } from 'youtube-transcript';

const TranscribeVideoInputSchema = z.object({
  youtubeUrl: z
    .string()
    .url()
    .describe('The URL of the public YouTube video to transcribe.'),
});
export type TranscribeVideoInput = z.infer<typeof TranscribeVideoInputSchema>;

const TranscribeVideoOutputSchema = z.object({
  transcript: z.string().describe('The full text transcript of the video audio.'),
});
export type TranscribeVideoOutput = z.infer<
  typeof TranscribeVideoOutputSchema
>;

export async function transcribeVideo(
  input: TranscribeVideoInput
): Promise<TranscribeVideoOutput> {
  return transcribeVideoFlow(input);
}


const transcribeVideoFlow = ai.defineFlow(
  {
    name: 'transcribeVideoFlow',
    inputSchema: TranscribeVideoInputSchema,
    outputSchema: TranscribeVideoOutputSchema,
  },
  async ({ youtubeUrl }) => {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(youtubeUrl);
      const fullText = transcript.map(item => item.text).join(' ');
      return { transcript: fullText };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Failed to fetch transcript for ${youtubeUrl}:`, error);
        throw new Error(`Could not fetch transcript. Please ensure the video has subtitles available. Error: ${message}`);
    }
  }
);
