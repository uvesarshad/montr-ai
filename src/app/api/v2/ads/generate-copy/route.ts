import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { generateAdCopy } from '@/ai/flows/generate-ad-copy-flow';
import { userRepository } from '@/lib/db/repository/user.repository';
import { AISettingsService } from '@/lib/services/ai-settings.service';
import { applyAiRateLimit } from '@/lib/ai/rate-limit';

/**
 * POST /api/v2/ads/generate-copy
 * Format-aware ad copy generation (Google RSA assets / Meta variants).
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const limited = await applyAiRateLimit(request, 'ai:ads-copy', session.user.id!);
        if (limited) return limited;

        const body = await request.json();
        const { platform, product, audience, tone, brandId, variants } = body;

        if (platform !== 'google_ads' && platform !== 'meta_ads') {
            return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
        }
        if (!product || typeof product !== 'string') {
            return NextResponse.json({ error: 'product is required' }, { status: 400 });
        }

        const user = await userRepository.findById(session.user.id!);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const preferredModel = await AISettingsService.getPreferredModel(session.user.id!, 'socialAssistant');

        const result = await generateAdCopy({
            platform,
            product,
            audience: typeof audience === 'string' ? audience : undefined,
            tone: typeof tone === 'string' ? tone : undefined,
            brandId: typeof brandId === 'string' ? brandId : undefined,
            variants: typeof variants === 'number' ? variants : undefined,
            model: preferredModel.modelId,
            routeHint: preferredModel.routeHint,
            userApiKeys: {
                openai: user.openaiApiKey || process.env.OPENAI_API_KEY,
                anthropic: user.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
                google: user.googleApiKey || process.env.GEMINI_API_KEY,
                xai: user.xaiApiKey || process.env.XAI_API_KEY,
                deepseek: user.deepseekApiKey || process.env.DEEPSEEK_API_KEY,
                mistral: user.mistralApiKey || process.env.MISTRAL_API_KEY,
                cohere: user.cohereApiKey || process.env.COHERE_API_KEY,
                groq: user.groqApiKey || process.env.GROQ_API_KEY,
                perplexity: user.perplexityApiKey || process.env.PERPLEXITY_API_KEY,
                fal: user.falApiKey || process.env.FAL_API_KEY,
                openrouter: user.openrouterApiKey || process.env.OPENROUTER_API_KEY,
            },
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error('Ad copy generation error:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to generate ad copy' },
            { status: 500 }
        );
    }
}
