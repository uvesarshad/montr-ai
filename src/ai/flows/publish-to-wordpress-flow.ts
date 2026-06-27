'use server';
/**
 * @fileOverview A flow to publish content to a WordPress site.
 *
 * - publishToWordPress - A function that takes content and publishes it as a new post.
 * - PublishToWordPressInput - The input type for the publishToWordPress function.
 * - PublishToWordPressOutput - The return type for the publishToWordPress function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const PublishToWordPressInputSchema = z.object({
  title: z.string().describe('The title of the blog post.'),
  content: z.string().describe('The HTML content of the blog post.'),
  status: z.enum(['publish', 'draft']).default('publish').describe('The status of the post (e.g., publish, draft).'),
  // You would also include authentication details here in a real app
});
export type PublishToWordPressInput = z.infer<typeof PublishToWordPressInputSchema>;

const PublishToWordPressOutputSchema = z.object({
  postId: z.number().describe('The ID of the newly created post.'),
  postUrl: z.string().url().describe('The URL of the newly created post.'),
});
export type PublishToWordPressOutput = z.infer<typeof PublishToWordPressOutputSchema>;


export async function publishToWordPress(input: PublishToWordPressInput): Promise<PublishToWordPressOutput> {
  return publishToWordPressFlow(input);
}


const publishToWordPressFlow = ai.defineFlow(
  {
    name: 'publishToWordPressFlow',
    inputSchema: PublishToWordPressInputSchema,
    outputSchema: PublishToWordPressOutputSchema,
  },
  async ({ title, content, status }) => {
    const wordpressUrl = process.env.WORDPRESS_URL;
    const wordpressUsername = process.env.WORDPRESS_USERNAME;
    const wordpressPassword = process.env.WORDPRESS_APPLICATION_PASSWORD;

    if (!wordpressUrl || !wordpressUsername || !wordpressPassword) {
      throw new Error('WordPress environment variables are not set. Please configure WORDPRESS_URL, WORDPRESS_USERNAME, and WORDPRESS_APPLICATION_PASSWORD in your .env file.');
    }

    const endpoint = `${wordpressUrl}/wp-json/wp/v2/posts`;
    
    // Create a basic auth header
    const credentials = Buffer.from(`${wordpressUsername}:${wordpressPassword}`).toString('base64');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credentials}`,
        },
        body: JSON.stringify({
          title,
          content,
          status,
        }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`WordPress API returned a 404 Not Found. Please ensure your WORDPRESS_URL in the .env file is correct (e.g., "https://your-domain.com", without /wp-admin) and the REST API is enabled.`);
        }
         if (response.status === 401) {
          throw new Error(`WordPress API returned a 401 Unauthorized error. Please ensure you are using an "Application Password" in the WORDPRESS_APPLICATION_PASSWORD .env variable, not your regular login password. You can generate one in your WordPress profile settings.`);
        }
        
        // Check content type before parsing
        const contentType = response.headers.get('content-type');
        let errorBody;
        if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorBody = errorData.message || JSON.stringify(errorData);
        } else {
            errorBody = await response.text();
             if (errorBody.toLowerCase().includes('<html>')) {
                throw new Error(`WordPress API returned an HTML page instead of JSON. This often indicates an authentication error or incorrect URL. Please verify your WORDPRESS_URL, username, and application password in the .env file. (Status: ${response.status})`);
            }
        }
        console.error('WordPress API Error:', errorBody);
        throw new Error(`WordPress API returned status ${response.status}: ${errorBody}`);
      }

      const post = await response.json();

      return {
        postId: post.id,
        postUrl: post.link,
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to publish to WordPress:', error);
      throw new Error(`Could not publish post: ${message}`);
    }
  }
);
