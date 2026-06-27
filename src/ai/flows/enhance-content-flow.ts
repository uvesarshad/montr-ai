'use server';

/**
 * Enhance Content Flow
 * 
 * Improves writing quality, fixes grammar, makes content more engaging
 */

import { z } from 'genkit';
import { generateTextWithClient } from '@/ai/client';
import { ApiKeysSchema, RouteHintSchema, BrandProfileSchema, buildBrandProfileNote } from '@/ai/types';
import { getSession } from '@/lib/get-session';
import { checkAICredits } from '@/ai/credit-wrapper';

const EnhanceContentInputSchema = z.object({
    content: z.string().describe('The original content to enhance'),
    platform: z.string().optional().describe('Target platform (twitter, linkedin, instagram, etc.)'),
    style: z.enum(['professional', 'casual', 'engaging', 'formal']).optional().describe('Desired writing style'),
    brandProfile: BrandProfileSchema,
    model: z.string().describe('The AI model to use'),
    userApiKeys: ApiKeysSchema,
    routeHint: RouteHintSchema.nullable().optional(),
});

type EnhanceContentInput = z.infer<typeof EnhanceContentInputSchema>;

interface EnhanceContentOutput {
    enhancedContent: string;
    changes: string[];
}

export async function enhanceContent(input: EnhanceContentInput): Promise<EnhanceContentOutput> {
    const { content, platform, style, brandProfile, model, userApiKeys, routeHint } = input;

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

    const platformGuide = platform ? `\nOptimize for ${platform}. ` : '';
    const styleGuide = style ? `Write in a ${style} tone.` : '';
    const brandNote = buildBrandProfileNote(brandProfile);

    const systemMessage = `You are an expert social media copywriter. Your task is to enhance the given content while preserving its core message.${platformGuide}${styleGuide}${brandNote}

Guidelines:
- Fix grammar and spelling errors
- Improve clarity and flow
- Make it more engaging and action-oriented
- Keep the original intent and meaning
- Do NOT add hashtags (those are handled separately)
- Return ONLY the enhanced text, nothing else`;

    const prompt = `Enhance this content:\n\n${content}`;

    try {
        const response = await generateTextWithClient({
            model,
            system: systemMessage,
            messages: [{ role: 'user', content: prompt }],
            userApiKeys,
            routeHint,
        });

        // Generate list of changes
        const changesPrompt = `Compare the original and enhanced text. List 2-3 key improvements made in a brief bullet format.

Original: ${content}

Enhanced: ${response}

List only the improvements, one per line starting with "-":`;

        const changesResponse = await generateTextWithClient({
            model,
            system: 'You are a helpful assistant. Be brief and concise.',
            messages: [{ role: 'user', content: changesPrompt }],
            userApiKeys,
            routeHint,
        });

        const changes = changesResponse
            .split('\n')
            .filter(line => line.trim().startsWith('-'))
            .map(line => line.replace(/^-\s*/, '').trim())
            .slice(0, 3);

        return {
            enhancedContent: response.trim(),
            changes,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error enhancing content:', error);
        throw new Error(`Failed to enhance content: ${message}`);
    }
}
