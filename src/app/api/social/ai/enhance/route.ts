import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { enhanceContent } from '@/ai/flows/enhance-content-flow';
import { userRepository } from '@/lib/db/repository/user.repository';
import { AISettingsService } from '@/lib/services/ai-settings.service';
import { applyAiRateLimit } from '@/lib/ai/rate-limit';
import { checkSocialAIAllowance, meterSocialAIGeneration } from '@/lib/social/plan-limits';
import { assertBrandAccess, brandAccessErrorResponse, loadBrandProfile, BrandAccessError } from '@/lib/social/brand-access';
import type { BrandProfile } from '@/ai/types';

/**
 * POST /api/social/ai/enhance
 * Enhance content with AI
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const limited = await applyAiRateLimit(request, 'ai:social-enhance', session.user.id!);
        if (limited) return limited;

        const body = await request.json();
        const { content, platform, style, brandId } = body;

        if (!content) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 });
        }

        // Optional brand-voice awareness: never trust client brandId — verify
        // access against the session user, then load the brand profile.
        let brandProfile: BrandProfile | undefined;
        if (brandId) {
            try {
                await assertBrandAccess(session.user.id!, brandId);
                brandProfile = await loadBrandProfile(brandId);
            } catch (err) {
                if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
                throw err;
            }
        }

        // Get user for API keys
        const user = await userRepository.findById(session.user.id!);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Plan enforcement: social AI feature flag + monthly generation cap
        // (audit B3). Org-less personal accounts are not metered.
        if (user.id) {
            const denied = await checkSocialAIAllowance(user.id!);
            if (denied) return NextResponse.json(denied, { status: 402 });
        }

        const preferredModel = await AISettingsService.getPreferredModel(session.user.id!, 'socialAssistant');

        const result = await enhanceContent({
            content,
            platform,
            style,
            brandProfile,
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

        await meterSocialAIGeneration(user.id!);

        return NextResponse.json(result);
    } catch (error) {
        console.error('AI enhance error:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to enhance content' },
            { status: 500 }
        );
    }
}
