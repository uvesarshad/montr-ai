import { z } from 'zod';

/**
 * API Keys Schema
 * 
 * Defines all supported API key fields for BYOK (Bring Your Own Key).
 * Keys are stored encrypted in the user profile.
 */
export const ApiKeysSchema = z.object({
    // AI Model Providers (native SDKs)
    openai: z.string().optional(),
    anthropic: z.string().optional(),
    google: z.string().optional(),
    xai: z.string().optional(),
    deepseek: z.string().optional(),
    sarvam: z.string().optional(),
    kimi: z.string().optional(),     // Moonshot AI
    zai: z.string().optional(),      // Zhipu / GLM
    // AI Model Providers (AI-SDK long-tail)
    mistral: z.string().optional(),
    cohere: z.string().optional(),
    groq: z.string().optional(),
    perplexity: z.string().optional(),
    together: z.string().optional(),
    fireworks: z.string().optional(),
    fal: z.string().optional(),

    // Video providers
    runway: z.string().optional(),
    pika: z.string().optional(),
    luma: z.string().optional(),
    kling: z.string().optional(),
    seedance: z.string().optional(),

    // Image providers
    replicate: z.string().optional(),
    ideogram: z.string().optional(),

    // Voice provider
    elevenlabs: z.string().optional(),

    // Gateway/Aggregator
    openrouter: z.string().optional(),

    // Scraping Services
    jinaai: z.string().optional(),
    apify: z.string().optional(),
}).optional();

export type ApiKeys = z.infer<typeof ApiKeysSchema>;

/**
 * Route Hint Schema
 * 
 * Provides explicit routing information for AI requests.
 * This tells the client which SDK and provider to use.
 */
export const RouteHintSchema = z.object({
    /** Which SDK to use for the request */
    sdk: z.enum(['genkit', 'aisdk']),
    /** Provider identifier */
    provider: z.string(),
    /** Key source - user's own key or platform key */
    keySource: z.enum(['user', 'system']),
}).optional();

export type RouteHint = z.infer<typeof RouteHintSchema>;

/**
 * Brand Profile Schema
 *
 * Compact brand-voice profile passed from the social AI routes into the flows
 * so generated content reflects the brand's voice. Built server-side from the
 * `BrandContext` model after `assertBrandAccess` — never trusted from the client.
 * All fields optional; only defined fields are included.
 */
export const BrandProfileSchema = z.object({
    brandVoice: z.string().optional(),
    tone: z.string().optional(),
    targetAudience: z.string().optional(),
    keyMessages: z.array(z.string()).optional(),
}).optional();

export type BrandProfile = z.infer<typeof BrandProfileSchema>;

/**
 * Render a brand profile as a system-prompt preamble fragment. Returns '' when
 * the profile is absent/empty so prompts are unchanged for non-branded calls.
 */
export function buildBrandProfileNote(profile?: BrandProfile): string {
    if (!profile) return '';
    const parts: string[] = [];
    if (profile.brandVoice) parts.push(`Write in this brand's voice: ${profile.brandVoice}`);
    if (profile.tone) parts.push(`Tone: ${profile.tone}`);
    if (profile.targetAudience) parts.push(`Target audience: ${profile.targetAudience}`);
    if (profile.keyMessages?.length) {
        parts.push(`Key messages to reinforce where natural: ${profile.keyMessages.join('; ')}`);
    }
    return parts.length ? `\n\nBrand context (follow this voice):\n${parts.join('\n')}` : '';
}

/**
 * Model Request Input
 * Common input for AI model requests
 */
export const ModelRequestInputSchema = z.object({
    /** Model ID to use */
    model: z.string(),
    /** System prompt */
    system: z.string().optional(),
    /** User prompt/message */
    prompt: z.string(),
    /** Optional context from connected nodes */
    context: z.string().optional(),
    /** Route hint for API routing */
    routeHint: RouteHintSchema,
});

export type ModelRequestInput = z.infer<typeof ModelRequestInputSchema>;

/**
 * Credit Check Result
 */
export interface CreditCheckResult {
    allowed: boolean;
    remaining: number;
    cost: number;
    reason?: 'insufficient_credits' | 'no_active_period';
}

/**
 * Model Access Info (for UI)
 */
export interface ModelAccessInfo {
    id: string;
    name: string;
    provider: string;
    type: 'text' | 'image' | 'video';
    tier: 'free' | 'pro' | 'enterprise';
    creditCost: number;
    isAvailable: boolean;
    isDisabled: boolean;
    usingByok: boolean;
    badge?: string | null;
    disabledReason?: 'upgrade_plan' | 'add_api_key' | 'insufficient_credits' | null;
    routeHint?: RouteHint | null;
}
