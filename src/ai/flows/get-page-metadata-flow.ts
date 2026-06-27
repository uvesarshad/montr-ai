'use server';
/**
 * @fileOverview A flow to fetch metadata (title, description, image) from a public webpage.
 *
 * - getPageMetadata - A function that scrapes a URL and returns its metadata.
 * - GetPageMetadataInput - The input type for the getPageMetadata function.
 * - GetPageMetadataOutput - The return type for the getPageMetadata function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import * as cheerio from 'cheerio';
import { URL } from 'url';

const GetPageMetadataInputSchema = z.object({
  url: z.string().url().describe('The URL of the public webpage to scrape.'),
});
export type GetPageMetadataInput = z.infer<typeof GetPageMetadataInputSchema>;

const GetPageMetadataOutputSchema = z.object({
  title: z.string().optional().describe('The title of the webpage.'),
  description: z.string().optional().describe('A brief description of the webpage.'),
  imageUrl: z.string().url().optional().describe('The URL of a thumbnail or preview image for the page.'),
});
export type GetPageMetadataOutput = z.infer<typeof GetPageMetadataOutputSchema>;


export async function getPageMetadata(
  input: GetPageMetadataInput
): Promise<GetPageMetadataOutput> {
  return getPageMetadataFlow(input);
}


const getPageMetadataFlow = ai.defineFlow(
  {
    name: 'getPageMetadataFlow',
    inputSchema: GetPageMetadataInputSchema,
    outputSchema: GetPageMetadataOutputSchema,
  },
  async ({url}) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch website content: ${response.statusText}`);
      }
      const html = await response.text();
      const $ = cheerio.load(html);

      const getMetatag = (name: string) => $(`meta[name="${name}"]`).attr('content') || $(`meta[property="og:${name}"]`).attr('content') || $(`meta[property="twitter:${name}"]`).attr('content');
      
      const title = getMetatag('title') || $('title').text() || 'No title found';
      
      const description = getMetatag('description') || 'No description found';

      let imageUrl = getMetatag('image');

      if (!imageUrl) {
         const favicon = $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href');
         if (favicon) {
            imageUrl = new URL(favicon, url).toString();
         }
      }
      
      return {
        title,
        description,
        imageUrl,
      };
      
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`Error in getPageMetadataFlow for url ${url}: ${message}`);
        // Return empty object on failure so the UI doesn't crash
        return {};
    }
  }
);
