'use server';
/**
 * @fileOverview A flow to process an Instagram URL, extract its content via Apify, and transcribe audio if present.
 *
 * - processInstagramPost - Scrapes an Instagram URL using an Apify actor, returns structured data, and transcribes audio.
 * - ProcessInstagramPostInput - The input type for the processInstagramPost function.
 * - ProcessInstagramPostOutput - The return type for the processInstagramPost function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import {transcribeAudio} from './transcribe-audio-flow';

const ProcessInstagramPostInputSchema = z.object({
  url: z.string().url().describe('The URL of the public Instagram post.'),
});
export type ProcessInstagramPostInput = z.infer<typeof ProcessInstagramPostInputSchema>;

const ProcessInstagramPostOutputSchema = z.object({
    postType: z.enum(['reel', 'carousel', 'single_image', 'unknown']).describe('The type of Instagram post.'),
    description: z.string().optional().describe("The post's caption or description."),
    mediaUrls: z.array(z.string().url()).optional().describe('A list of URLs for the images or video in the post.'),
    transcript: z.string().optional().describe('The audio transcript if the post is a reel.'),
});
export type ProcessInstagramPostOutput = z.infer<typeof ProcessInstagramPostOutputSchema>;

export async function processInstagramPost(input: ProcessInstagramPostInput): Promise<ProcessInstagramPostOutput> {
  return processInstagramPostFlow(input);
}

const ACTOR_ID = 'shu8hvrXbJbY3Eb9W';
const APIFY_BASE_URL = 'https://api.apify.com/v2';


const processInstagramPostFlow = ai.defineFlow(
  {
    name: 'processInstagramPostFlow',
    inputSchema: ProcessInstagramPostInputSchema,
    outputSchema: ProcessInstagramPostOutputSchema,
  },
  async ({url}) => {
    const apifyToken = process.env.APIFY_API_TOKEN;
    if (!apifyToken) {
      throw new Error('Apify API token is not configured in environment variables.');
    }

    // 1. Prepare the Actor input
    const actorInput = {
      directUrls: [url],
      resultsType: 'posts',
      resultsLimit: 1, // We only want the single post from the URL
      addParentData: false,
    };
    
    // 2. Call the Apify actor
    const runUrl = `${APIFY_BASE_URL}/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${apifyToken}`;
    
    try {
      const response = await fetch(runUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(actorInput),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Apify API Error: ${response.status} - ${errorText}`);
      }

      const results = await response.json();
      
      // 3. Process the results
      if (!results || results.length === 0) {
        throw new Error('Apify actor did not return any items.');
      }
      
      const postData = results[0];
      
      const mediaUrls = postData.images || (postData.videoUrl ? [postData.videoUrl] : []);
      let postType: 'reel' | 'carousel' | 'single_image' | 'unknown' = 'unknown';
      let transcript: string | undefined = undefined;

      if (postData.videoUrl) {
          postType = 'reel';
          // 4. If it's a video/reel, fetch and transcribe the audio
          try {
            console.log(`Fetching audio from: ${postData.videoUrl}`);
            const audioResponse = await fetch(postData.videoUrl);
            if (!audioResponse.ok) throw new Error(`Failed to download audio file from URL: ${postData.videoUrl}`);
            
            const audioBuffer = await audioResponse.arrayBuffer();
            const audioBase64 = Buffer.from(audioBuffer).toString('base64');
            const mimeType = audioResponse.headers.get('content-type') || 'video/mp4';

            console.log(`Sending audio to transcription service (mimeType: ${mimeType})...`);
            const transcriptionResult = await transcribeAudio({ audioBase64, mimeType });
            transcript = transcriptionResult.transcript;
            console.log('Transcription successful.');

          } catch (transcriptionError) {
             const tMessage = transcriptionError instanceof Error ? transcriptionError.message : String(transcriptionError);
             console.error("Audio transcription failed:", tMessage);
             // We don't want to fail the whole flow if only transcription fails
             transcript = `[Audio transcription failed: ${tMessage}]`;
          }
      } else if (mediaUrls.length > 1) {
          postType = 'carousel';
      } else if (mediaUrls.length === 1) {
          postType = 'single_image';
      }

      return {
        postType,
        description: postData.caption || '',
        mediaUrls,
        transcript: transcript,
      };

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Error calling Apify actor:", error);
        throw new Error(`Failed to scrape Instagram post: ${message}`);
    }
  }
);
