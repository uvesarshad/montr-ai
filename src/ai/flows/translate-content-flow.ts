'use server';

/**
 * Translate Content Flow
 * 
 * Translate content to target language while preserving tone and intent
 */

import { z } from 'genkit';
import { generateTextWithClient } from '@/ai/client';
import { ApiKeysSchema, RouteHintSchema, BrandProfileSchema, buildBrandProfileNote } from '@/ai/types';
import { getSession } from '@/lib/get-session';
import { checkAICredits } from '@/ai/credit-wrapper';

const TranslateContentInputSchema = z.object({
    content: z.string().describe('Content to translate'),
    targetLanguage: z.string().describe('Target language (e.g., "Spanish", "French", "Japanese")'),
    sourceLanguage: z.string().optional().describe('Source language (auto-detect if not provided)'),
    preserveTone: z.boolean().optional().describe('Whether to preserve casual/formal tone'),
    localize: z.boolean().optional().describe('Adapt cultural references and idioms'),
    brandProfile: BrandProfileSchema,
    model: z.string().describe('The AI model to use'),
    userApiKeys: ApiKeysSchema,
    routeHint: RouteHintSchema.nullable().optional(),
});

type TranslateContentInput = z.infer<typeof TranslateContentInputSchema>;

interface TranslateContentOutput {
    translatedContent: string;
    sourceLanguage: string;
    targetLanguage: string;
}

export async function translateContent(input: TranslateContentInput): Promise<TranslateContentOutput> {
    const { content, targetLanguage, sourceLanguage, preserveTone = true, localize = true, brandProfile, model, userApiKeys, routeHint } = input;

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

    const sourceNote = sourceLanguage ? `from ${sourceLanguage}` : '(detect source language)';
    const toneNote = preserveTone ? '\n- Preserve the original tone (casual/formal/professional)' : '';
    const localizeNote = localize ? '\n- Localize idioms and cultural references for the target audience' : '';
    const brandNote = buildBrandProfileNote(brandProfile);

    const systemMessage = `You are a professional translator specializing in social media content.${brandNote}

Translation Guidelines:
- Translate ${sourceNote} to ${targetLanguage}
- Maintain the original meaning and intent${toneNote}${localizeNote}
- Keep hashtags in their original language unless they translate well
- Preserve emojis
- Do NOT add any explanations or notes
- Return ONLY the translated text

If the text is already in the target language, return it unchanged.`;

    const prompt = `Translate to ${targetLanguage}:\n\n${content}`;

    try {
        // Detect source language if not provided
        let detectedSourceLanguage = sourceLanguage || 'Auto-detected';

        if (!sourceLanguage) {
            const detectPrompt = `What language is this text written in? Reply with ONLY the language name (e.g., "English", "Spanish"):\n\n${content}`;
            const detectResponse = await generateTextWithClient({
                model,
                system: 'Reply with only the language name, nothing else.',
                messages: [{ role: 'user', content: detectPrompt }],
                userApiKeys,
                routeHint,
            });
            detectedSourceLanguage = detectResponse.trim();
        }

        // Translate content
        const response = await generateTextWithClient({
            model,
            system: systemMessage,
            messages: [{ role: 'user', content: prompt }],
            userApiKeys,
            routeHint,
        });

        return {
            translatedContent: response.trim(),
            sourceLanguage: detectedSourceLanguage,
            targetLanguage,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error translating content:', error);
        throw new Error(`Failed to translate content: ${message}`);
    }
}
