'use server';
/**
 * @fileOverview A flow to convert a URL into Markdown content.
 *
 * - convertUrlToMarkdown - A function that scrapes a URL and returns its content as Markdown.
 * - ConvertUrlToMarkdownInput - The input type for the convertUrlToMarkdown function.
 * - ConvertUrlToMarkdownOutput - The return type for the convertUrlToMarkdown function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ConvertUrlToMarkdownInputSchema = z.object({
  url: z.string().url().describe('The URL of the public webpage to scrape.'),
});
export type ConvertUrlToMarkdownInput = z.infer<
  typeof ConvertUrlToMarkdownInputSchema
>;

const ConvertUrlToMarkdownOutputSchema = z.object({
  markdownContent: z.string().describe('The main content of the webpage, converted to well-structured Markdown.'),
});
export type ConvertUrlToMarkdownOutput = z.infer<
  typeof ConvertUrlToMarkdownOutputSchema
>;

export async function convertUrlToMarkdown(
  input: ConvertUrlToMarkdownInput
): Promise<ConvertUrlToMarkdownOutput> {
  return convertUrlToMarkdownFlow(input);
}


const fallbackPrompt = ai.definePrompt({
    name: 'fallbackUrlToMarkdownPrompt',
    input: {schema: ConvertUrlToMarkdownInputSchema},
    output: {schema: ConvertUrlToMarkdownOutputSchema},
    prompt: `Please fetch the content from the following URL and convert it to clean, well-formatted Markdown.
URL: {{{url}}}`,
});


const convertUrlToMarkdownFlow = ai.defineFlow(
  {
    name: 'convertUrlToMarkdownFlow',
    inputSchema: ConvertUrlToMarkdownInputSchema,
    outputSchema: ConvertUrlToMarkdownOutputSchema,
  },
  async ({url}) => {
    try {
        // 1. Primary Method: Use Jina AI Reader
        const jinaUrl = `https://r.jina.ai/${url}`;
        const response = await fetch(jinaUrl, {
            headers: {
                'Accept': 'application/json',
            },
        });

        if (response.ok) {
            const data = await response.json();
            if (data && data.data && data.data.content) {
                return { markdownContent: data.data.content };
            }
        }
        
        // If Jina response is not ok or content is missing, fall through to backup
        throw new Error(`Jina AI Reader failed with status: ${response.status}`);

    } catch (jinaError) {
        const jinaMessage = jinaError instanceof Error ? jinaError.message : String(jinaError);
        console.warn(`Primary method (Jina AI) failed for ${url}: ${jinaMessage}. Using fallback.`);

        // 2. Fallback Method: Use Gemini
        try {
            const { output } = await fallbackPrompt({ url });
             if (!output) {
                throw new Error('Fallback AI failed to produce output.');
            }
            return output;
        } catch (geminiError) {
            const geminiMessage = geminiError instanceof Error ? geminiError.message : String(geminiError);
            console.error(`Fallback method (Gemini) also failed for ${url}: ${geminiMessage}`);
            throw new Error(`Both primary and fallback methods failed to fetch content for the URL.`);
        }
    }
  }
);
