'use server';

/**
 * Generate Post Ideas Flow
 * 
 * Generate creative post ideas based on topic/industry
 */

import { z } from 'genkit';
import { generateTextWithClient } from '@/ai/client';
import { ApiKeysSchema, RouteHintSchema, BrandProfileSchema, buildBrandProfileNote } from '@/ai/types';
import { getSession } from '@/lib/get-session';
import { checkAICredits } from '@/ai/credit-wrapper';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const GeneratePostIdeasInputSchema = z.object({
    topic: z.string().describe('Topic or theme for post ideas'),
    industry: z.string().optional().describe('Industry or niche'),
    platform: z.string().optional().describe('Target platform'),
    count: z.number().min(1).max(10).optional().describe('Number of ideas to generate'),
    contentTypes: z.array(z.string()).optional().describe('Types of content (educational, promotional, etc.)'),
    brandProfile: BrandProfileSchema,
    model: z.string().describe('The AI model to use'),
    userApiKeys: ApiKeysSchema,
    routeHint: RouteHintSchema.nullable().optional(),
});

type GeneratePostIdeasInput = z.infer<typeof GeneratePostIdeasInputSchema>;

interface PostIdea {
    title: string;
    hook: string;
    contentType: string;
    outline: string[];
}

interface GeneratePostIdeasOutput {
    ideas: PostIdea[];
}

export async function generatePostIdeas(input: GeneratePostIdeasInput): Promise<GeneratePostIdeasOutput> {
    const { topic, industry, platform, count = 5, contentTypes, brandProfile, model, userApiKeys, routeHint } = input;

    // Credit check
    const session = await getSession();
    if (!session?.user?.id) throw new Error('Unauthorized');
    const creditCheck = await checkAICredits(session.user.id, model);
    if (!creditCheck.allowed) {
        throw new Error(
            creditCheck.reason === 'insufficient_credits'
                ? `Insufficient credits. You need ${creditCheck.cost} credits but have ${creditCheck.remaining}.`
                : 'No active subscription. Please subscribe to use AI features.'
        );
    }

    const industryNote = industry ? ` in the ${industry} industry` : '';
    const platformNote = platform ? ` for ${platform}` : '';
    const typesNote = contentTypes?.length ? `\nContent types to include: ${contentTypes.join(', ')}` : '';
    const brandNote = buildBrandProfileNote(brandProfile);

    const systemMessage = `You are a creative social media strategist. Generate engaging post ideas${platformNote}${industryNote}.${typesNote}${brandNote}

For each idea provide:
1. A catchy title
2. A hook (first line to grab attention)
3. Content type (educational, promotional, behind-the-scenes, etc.)
4. Brief outline (3-4 bullet points)

Format each idea as:
---
TITLE: [title]
HOOK: [hook]
TYPE: [content type]
OUTLINE:
- [point 1]
- [point 2]
- [point 3]
---`;

    const prompt = `Generate ${count} post ideas about: ${topic}`;

    try {
        const response = await generateTextWithClient({
            model,
            system: systemMessage,
            messages: [{ role: 'user', content: prompt }],
            userApiKeys,
            routeHint,
        });

        // Parse the response into structured ideas
        const ideaBlocks = response.split('---').filter(block => block.trim());
        const ideas: PostIdea[] = [];

        for (const block of ideaBlocks) {
            if (ideas.length >= count) break;

            const titleMatch = block.match(/TITLE:\s*(.+)/i);
            const hookMatch = block.match(/HOOK:\s*(.+)/i);
            const typeMatch = block.match(/TYPE:\s*(.+)/i);
            const outlineMatch = block.match(/OUTLINE:\s*([\s\S]*?)(?=---|\n\n|$)/i);

            if (titleMatch && hookMatch) {
                const outline = outlineMatch
                    ? outlineMatch[1]
                        .split('\n')
                        .filter(line => line.trim().startsWith('-'))
                        .map(line => line.replace(/^-\s*/, '').trim())
                    : [];

                ideas.push({
                    title: titleMatch[1].trim(),
                    hook: hookMatch[1].trim(),
                    contentType: typeMatch ? typeMatch[1].trim() : 'General',
                    outline,
                });
            }
        }

        return { ideas };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error generating post ideas:', error);
        throw new Error(`Failed to generate post ideas: ${message}`);
    }
}
