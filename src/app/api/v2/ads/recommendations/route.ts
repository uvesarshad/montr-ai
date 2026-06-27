import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { AISettingsService } from '@/lib/services/ai-settings.service';
import { applyAiRateLimit } from '@/lib/ai/rate-limit';
import { generateAdsRecommendations } from '@/lib/ads/recommendations';

/**
 * POST /api/v2/ads/recommendations
 * AI analysis of the org's ad performance — read-only suggestions, never
 * applied automatically (guardrail §3.5).
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const limited = await applyAiRateLimit(request, 'ai:ads-insights', session.user.id!);
        if (limited) return limited;

        const user = await userRepository.findById(session.user.id!);
        if (!user) {
            return NextResponse.json({ error: 'Organization required' }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const brandId = typeof body.brandId === 'string' ? body.brandId : undefined;
        const days = typeof body.days === 'number' && body.days >= 7 && body.days <= 90 ? body.days : 14;

        const preferredModel = await AISettingsService.getPreferredModel(session.user.id!, 'socialAssistant');

        const result = await generateAdsRecommendations({
            brandId,
            days,
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
        console.error('Ads recommendations error:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to generate recommendations' },
            { status: 500 }
        );
    }
}
