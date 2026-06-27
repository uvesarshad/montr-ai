'use server';
/**
 * @fileOverview A flow to fetch structured data for a single tweet.
 *
 * - getTweetData - A function that takes a tweet ID and returns its data.
 * - GetTweetDataInput - The input type for the getTweetData function.
 * - GetTweetDataOutput - The return type for the getTweetData function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getTweet } from 'react-tweet/api';

const GetTweetDataInputSchema = z.object({
  tweetId: z.string().describe('The ID of the tweet to fetch.'),
});
export type GetTweetDataInput = z.infer<typeof GetTweetDataInputSchema>;

// We can't use the full `Tweet` type from the library, so we define what we need.
const GetTweetDataOutputSchema = z.object({
  text: z.string().optional().describe('The main text content of the tweet.'),
  mediaUrls: z.array(z.string().url()).optional().describe('URLs of any images or videos in the tweet.'),
});
export type GetTweetDataOutput = z.infer<typeof GetTweetDataOutputSchema>;


export async function getTweetData(input: GetTweetDataInput): Promise<GetTweetDataOutput> {
    return getTweetDataFlow(input);
}


const getTweetDataFlow = ai.defineFlow(
  {
    name: 'getTweetDataFlow',
    inputSchema: GetTweetDataInputSchema,
    outputSchema: GetTweetDataOutputSchema,
  },
  async ({ tweetId }) => {
    try {
        const tweet = await getTweet(tweetId);

        if (!tweet) {
            return { text: '', mediaUrls: [] };
        }

        // Extract text and media URLs
        const text = tweet.text;
        // @ts-expect-error - react-tweet types incomplete for media entities
        const mediaUrls = tweet.entities.media?.filter(m => m.type === 'photo').map(m => m.media_url_https) || [];

        return {
            text,
            mediaUrls,
        };

    } catch (error) {
      console.error(`Failed to fetch tweet data for ID ${tweetId}:`, error);
      throw new Error(`Could not fetch tweet data. Please ensure the tweet ID is valid and public.`);
    }
  }
);
