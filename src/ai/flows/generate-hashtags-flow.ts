'use server';

/**
 * Generate Hashtags Flow
 * 
 * Generates relevant, trending hashtags for content and platform
 */

import { z } from 'genkit';
import { generateTextWithClient } from '@/ai/client';
import { ApiKeysSchema, RouteHintSchema, BrandProfileSchema, buildBrandProfileNote } from '@/ai/types';
import { getSession } from '@/lib/get-session';
import { checkAICredits } from '@/ai/credit-wrapper';

const GenerateHashtagsInputSchema = z.object({
    content: z.string().describe('The content to generate hashtags for'),
    platform: z.string().optional().describe('Target platform (instagram, twitter, linkedin, tiktok)'),
    count: z.number().min(1).max(30).optional().describe('Number of hashtags to generate'),
    industry: z.string().optional().describe('Industry or niche for more relevant hashtags'),
    brandProfile: BrandProfileSchema,
    model: z.string().describe('The AI model to use'),
    userApiKeys: ApiKeysSchema,
    routeHint: RouteHintSchema.nullable().optional(),
});

type GenerateHashtagsInput = z.infer<typeof GenerateHashtagsInputSchema>;

interface GenerateHashtagsOutput {
    hashtags: string[];
    categories: {
        popular: string[];
        niche: string[];
        branded: string[];
    };
}

export async function generateHashtags(input: GenerateHashtagsInput): Promise<GenerateHashtagsOutput> {
    const { content, platform, count = 10, industry, brandProfile, model, userApiKeys, routeHint } = input;

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

    const platformLimits: Record<string, number> = {
        instagram: 30,
        twitter: 5,
        linkedin: 5,
        tiktok: 10,
    };

    const maxHashtags = platform ? Math.min(count, platformLimits[platform] || count) : count;
    const platformNote = platform ? `Optimize for ${platform}. ` : '';
    const industryNote = industry ? `Industry: ${industry}. ` : '';
    const brandNote = buildBrandProfileNote(brandProfile);

    const systemMessage = `You are a social media hashtag expert. Generate hashtags that will maximize reach and engagement.${platformNote}${industryNote}${brandNote}

Guidelines:
- Mix popular (broad reach) and niche (targeted) hashtags
- Include 1-2 trending hashtags if relevant
- Avoid banned or overused spam hashtags
- Format each hashtag properly with # prefix
- Return ONLY hashtags, one per line`;

    const prompt = `Generate ${maxHashtags} relevant hashtags for this content:\n\n${content}`;

    try {
        const response = await generateTextWithClient({
            model,
            system: systemMessage,
            messages: [{ role: 'user', content: prompt }],
            userApiKeys,
            routeHint,
        });

        // Parse hashtags from response
        const allHashtags = response
            .split(/[\n,\s]+/)
            .map(tag => tag.trim())
            .filter(tag => tag.startsWith('#') && tag.length > 1)
            .map(tag => tag.toLowerCase())
            .slice(0, maxHashtags);

        // Remove duplicates
        const uniqueHashtags = [...new Set(allHashtags)];

        // Categorize (simplified - in production would use API data)
        const popular = uniqueHashtags.slice(0, Math.ceil(uniqueHashtags.length / 3));
        const niche = uniqueHashtags.slice(Math.ceil(uniqueHashtags.length / 3), Math.ceil(uniqueHashtags.length * 2 / 3));
        const branded = uniqueHashtags.slice(Math.ceil(uniqueHashtags.length * 2 / 3));

        return {
            hashtags: uniqueHashtags,
            categories: {
                popular,
                niche,
                branded,
            },
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error generating hashtags:', error);
        throw new Error(`Failed to generate hashtags: ${message}`);
    }
}
