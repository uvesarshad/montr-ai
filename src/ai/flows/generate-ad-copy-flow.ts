'use server';

/**
 * Generate Ad Copy Flow
 *
 * Format-aware ad copy generation:
 *  - google_ads: Responsive Search Ad assets (≤15 headlines × 30 chars,
 *    ≤4 descriptions × 90 chars) — hard limits enforced post-generation.
 *  - meta_ads: N variants of primary text / headline / description.
 *
 * Brand voice comes from BrandContext when a brandId is provided.
 */

import { z } from 'genkit';
import { generateTextWithClient } from '@/ai/client';
import { ApiKeysSchema, RouteHintSchema } from '@/ai/types';
import { getSession } from '@/lib/get-session';
import { checkAICredits, consumeAICredits } from '@/ai/credit-wrapper';
import { connectMongoose } from '@/lib/mongodb';
import BrandContext from '@/lib/db/models/brand-context.model';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const GenerateAdCopyInputSchema = z.object({
    platform: z.enum(['google_ads', 'meta_ads']),
    product: z.string().describe('What is being advertised — product, offer, or landing page summary'),
    audience: z.string().optional().describe('Target audience description'),
    tone: z.string().optional().describe('Tone override (defaults to brand voice)'),
    brandId: z.string().optional(),
    variants: z.number().min(1).max(5).optional().describe('meta_ads only: number of copy variants'),
    model: z.string().describe('The AI model to use'),
    userApiKeys: ApiKeysSchema,
    routeHint: RouteHintSchema.nullable().optional(),
});

type GenerateAdCopyInput = z.infer<typeof GenerateAdCopyInputSchema>;

export interface MetaCopyVariant {
    primaryText: string;
    headline: string;
    description: string;
}

export interface GenerateAdCopyOutput {
    google?: { headlines: string[]; descriptions: string[] };
    meta?: { variants: MetaCopyVariant[] };
    creditsUsed?: number;
}

const RSA_HEADLINE_MAX = 30;
const RSA_DESCRIPTION_MAX = 90;
const META_HEADLINE_MAX = 40;
const META_DESCRIPTION_MAX = 30;
const META_PRIMARY_MAX = 300;

async function buildBrandVoiceNote(brandId?: string): Promise<string> {
    if (!brandId) return '';
    try {
        await connectMongoose();
        const query: Record<string, string> = { brandId };
        const ctx = await BrandContext.findOne(query).lean<{
            brandVoice?: string;
            targetAudience?: string;
            keyMessages?: string[];
            tone?: string;
        } | null>();
        if (!ctx) return '';

        const parts: string[] = [];
        if (ctx.brandVoice) parts.push(`Brand voice: ${ctx.brandVoice}`);
        if (ctx.tone) parts.push(`Tone: ${ctx.tone}`);
        if (ctx.targetAudience) parts.push(`Audience: ${ctx.targetAudience}`);
        if (ctx.keyMessages?.length) parts.push(`Key messages: ${ctx.keyMessages.join('; ')}`);
        return parts.length ? `\nBrand context (follow this voice):\n${parts.join('\n')}` : '';
    } catch {
        return '';
    }
}

/** Extract the first JSON object from a model response (handles code fences) */
function parseJsonResponse(raw: string): Record<string, unknown> {
    const cleaned = raw.replace(/```(?:json)?/gi, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
        throw new Error('Model did not return JSON');
    }
    return JSON.parse(cleaned.slice(start, end + 1));
}

function cleanLines(values: unknown, maxLength: number, maxCount: number): string[] {
    if (!Array.isArray(values)) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const text = String(value ?? '').replace(/^["'\s•-]+|["'\s]+$/g, '').trim();
        if (!text || text.length > maxLength) continue; // drop over-limit rather than mid-word truncate
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(text);
        if (result.length >= maxCount) break;
    }
    return result;
}

export async function generateAdCopy(input: GenerateAdCopyInput): Promise<GenerateAdCopyOutput> {
    const { platform, product, audience, tone, brandId, variants = 3, model, userApiKeys, routeHint } = input;

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

    const brandNote = await buildBrandVoiceNote(brandId);
    const audienceNote = audience ? `\nTarget audience: ${audience}` : '';
    const toneNote = tone ? `\nTone: ${tone}` : '';
    const usingByok = routeHint?.keySource === 'user';

    let systemMessage: string;
    let prompt: string;

    if (platform === 'google_ads') {
        systemMessage = `You are a senior Google Ads copywriter. You write Responsive Search Ad assets with STRICT length limits:
- Headlines: max ${RSA_HEADLINE_MAX} characters each. Punchy, varied angles (benefit, CTA, social proof, urgency, question).
- Descriptions: max ${RSA_DESCRIPTION_MAX} characters each.
Count characters carefully — anything over the limit is rejected.${brandNote}

Respond with ONLY this JSON shape, no commentary:
{"headlines": ["..."], "descriptions": ["..."]}`;
        prompt = `Write 15 headlines and 4 descriptions for a Google Search ad promoting:\n${product}${audienceNote}${toneNote}`;
    } else {
        systemMessage = `You are a senior Meta (Facebook/Instagram) ads copywriter. For each variant you write:
- primaryText: the main copy above the creative, max ${META_PRIMARY_MAX} characters, hook in the first sentence.
- headline: max ${META_HEADLINE_MAX} characters.
- description: max ${META_DESCRIPTION_MAX} characters.
Count characters carefully — anything over the limit is rejected.${brandNote}

Respond with ONLY this JSON shape, no commentary:
{"variants": [{"primaryText": "...", "headline": "...", "description": "..."}]}`;
        prompt = `Write ${variants} distinct ad copy variants (different angles) promoting:\n${product}${audienceNote}${toneNote}`;
    }

    try {
        const response = await generateTextWithClient({
            model,
            system: systemMessage,
            messages: [{ role: 'user', content: prompt }],
            userApiKeys,
            routeHint,
            temperature: 0.8,
        });

        const parsed = parseJsonResponse(response);
        await consumeAICredits(session.user.id, model, 'text', usingByok);

        if (platform === 'google_ads') {
            const headlines = cleanLines(parsed.headlines, RSA_HEADLINE_MAX, 15);
            const descriptions = cleanLines(parsed.descriptions, RSA_DESCRIPTION_MAX, 4);
            if (headlines.length < 3 || descriptions.length < 2) {
                throw new Error('Generated copy did not meet the RSA minimums — please try again');
            }
            return { google: { headlines, descriptions }, creditsUsed: creditCheck.cost };
        }

        const rawVariants = Array.isArray(parsed.variants) ? parsed.variants : [];
        const metaVariants: MetaCopyVariant[] = rawVariants
            .map((variant: Record<string, unknown>) => ({
                primaryText: String(variant?.primaryText ?? '').trim().slice(0, META_PRIMARY_MAX),
                headline: String(variant?.headline ?? '').trim().slice(0, META_HEADLINE_MAX),
                description: String(variant?.description ?? '').trim().slice(0, META_DESCRIPTION_MAX),
            }))
            .filter((variant: MetaCopyVariant) => variant.primaryText.length > 0)
            .slice(0, variants);

        if (metaVariants.length === 0) {
            throw new Error('Generated copy was empty — please try again');
        }
        return { meta: { variants: metaVariants }, creditsUsed: creditCheck.cost };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Error generating ad copy:', error);
        throw new Error(`Failed to generate ad copy: ${message}`);
    }
}
