'use server';

/**
 * Repurpose Content Flow
 * 
 * Transform content for different platforms
 */

import { z } from 'genkit';
import { generateTextWithClient } from '@/ai/client';
import { ApiKeysSchema, RouteHintSchema, BrandProfileSchema, buildBrandProfileNote } from '@/ai/types';
import { getSession } from '@/lib/get-session';
import { checkAICredits } from '@/ai/credit-wrapper';

const RepurposeContentInputSchema = z.object({
    content: z.string().describe('Original content to repurpose'),
    sourcePlatform: z.string().optional().describe('Original platform'),
    targetPlatform: z.string().describe('Target platform to adapt for'),
    brandProfile: BrandProfileSchema,
    model: z.string().describe('The AI model to use'),
    userApiKeys: ApiKeysSchema,
    routeHint: RouteHintSchema.nullable().optional(),
});

type RepurposeContentInput = z.infer<typeof RepurposeContentInputSchema>;

interface RepurposeContentOutput {
    repurposedContent: string;
    platformTips: string[];
    characterCount: number;
}

const platformCharacterLimits: Record<string, number> = {
    twitter: 280,
    instagram: 2200,
    linkedin: 3000,
    facebook: 63206,
    tiktok: 2200,
    pinterest: 500,
    threads: 500,
};

const platformStyles: Record<string, string> = {
    twitter: 'Concise, punchy, use line breaks for impact. Include a call-to-action.',
    instagram: 'Story-driven, use emojis strategically, create hooks in first line.',
    linkedin: 'Professional but personal, use "I" statements, include insights and lessons.',
    facebook: 'Conversational, can be longer, encourage engagement with questions.',
    tiktok: 'Trendy, casual, use Gen-Z language appropriately, create curiosity.',
    pinterest: 'Descriptive, keyword-rich, clear value proposition.',
    threads: 'Conversational, authentic, Twitter-like but more casual.',
};

export async function repurposeContent(input: RepurposeContentInput): Promise<RepurposeContentOutput> {
    const { content, sourcePlatform, targetPlatform, brandProfile, model, userApiKeys, routeHint } = input;

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

    const charLimit = platformCharacterLimits[targetPlatform] || 2000;
    const styleGuide = platformStyles[targetPlatform] || 'Engaging and clear.';
    const sourceNote = sourcePlatform ? ` (originally for ${sourcePlatform})` : '';
    const brandNote = buildBrandProfileNote(brandProfile);

    const systemMessage = `You are a social media content strategist. Repurpose the given content${sourceNote} for ${targetPlatform}.${brandNote}

Target Platform Guidelines:
- Character limit: ${charLimit}
- Style: ${styleGuide}

Rules:
- Preserve the core message and key points
- Adapt tone and format for the target platform
- Stay within character limit
- Do NOT include hashtags
- Return ONLY the repurposed content`;

    const prompt = `Repurpose this content for ${targetPlatform}:\n\n${content}`;

    try {
        const response = await generateTextWithClient({
            model,
            system: systemMessage,
            messages: [{ role: 'user', content: prompt }],
            userApiKeys,
            routeHint,
        });

        const repurposedContent = response.trim().slice(0, charLimit);

        // Generate platform-specific tips
        const tipsPrompt = `Give 2-3 very brief tips for posting this on ${targetPlatform}. One tip per line starting with "-":`;

        const tipsResponse = await generateTextWithClient({
            model,
            system: 'Be extremely brief. Return only tips, one per line.',
            messages: [{ role: 'user', content: tipsPrompt }],
            userApiKeys,
            routeHint,
        });

        const platformTips = tipsResponse
            .split('\n')
            .reduce<string[]>((acc, line) => {
                if (line.trim().startsWith('-')) {
                    acc.push(line.replace(/^-\s*/, '').trim());
                }
                return acc;
            }, [])
            .slice(0, 3);

        return {
            repurposedContent,
            platformTips,
            characterCount: repurposedContent.length,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error repurposing content:', error);
        throw new Error(`Failed to repurpose content: ${message}`);
    }
}
