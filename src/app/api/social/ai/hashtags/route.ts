import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { generateHashtags } from '@/ai/flows/generate-hashtags-flow';
import { userRepository } from '@/lib/db/repository/user.repository';
import { applyAiRateLimit } from '@/lib/ai/rate-limit';
import { checkSocialAIAllowance, meterSocialAIGeneration } from '@/lib/social/plan-limits';
import { assertBrandAccess, brandAccessErrorResponse, loadBrandProfile, BrandAccessError } from '@/lib/social/brand-access';
import type { BrandProfile } from '@/ai/types';

/**
 * POST /api/social/ai/hashtags
 * Generate hashtags with AI
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const limited = await applyAiRateLimit(request, 'ai:social-hashtags', session.user.id!);
        if (limited) return limited;

        const body = await request.json();
        const { content, platform, count, industry, brandId } = body;

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

        const result = await generateHashtags({
            content,
            platform,
            count: count || 10,
            industry,
            brandProfile,
            model: 'openai/gpt-4o-mini',
            userApiKeys: {
                // @ts-expect-error
                openaiApiKey: user.openaiApiKey || process.env.OPENAI_API_KEY,
            },
        });

        await meterSocialAIGeneration(user.id!);

        return NextResponse.json(result);
    } catch (error) {
        console.error('AI hashtags error:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to generate hashtags' },
            { status: 500 }
        );
    }
}
