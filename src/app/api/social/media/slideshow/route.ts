import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import { applyAiRateLimit } from '@/lib/ai/rate-limit';


import { assertBrandAccess, brandAccessErrorResponse, BrandAccessError } from '@/lib/social/brand-access';
import { generateSlideshowScript } from '@/lib/social/video/script';
import { assembleSlideshow } from '@/lib/social/video/slideshow';
import { mediaAssetRepository } from '@/lib/db/repository/media-asset.repository';

/**
 * POST /api/social/media/slideshow  (Epic 4.3 — AI slideshow→video)
 *
 * Turn a topic/brief into a captioned slideshow MP4: AI script → per-slide AI
 * image + TTS narration → ffmpeg assembly → storage upload → MediaAsset record
 * (so it appears in the media library and is attachable as a post `mediaUrls`).
 *
 * Gating mirrors the other social-AI endpoints but adds the dedicated
 * `allowAiVideo` plan feature on top of the social-AI feature + monthly cap.
 * Org-less personal accounts skip plan gating/metering.
 */

const BodySchema = z.object({
    brandId: z.string().min(1, 'brandId is required'),
    topic: z.string().min(1, 'A topic or script is required').max(5000),
    slideCount: z.number().int().min(2).max(10).optional(),
    voice: z.string().max(40).optional(),
});

export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }
        const userId = session.user.id;

        // Slideshow rendering is heavy — rate-limit it like the other AI endpoints.
        const limited = await applyAiRateLimit(request, 'ai:social-slideshow', userId);
        if (limited) return limited;

        const parsed = BodySchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message || 'Invalid request' },
                { status: 400 }
            );
        }
        const { brandId, topic, slideCount, voice } = parsed.data;

        // Never trust the client brandId — resolve the org from the brand/user record.
        try {
            ({ } = await assertBrandAccess(userId, brandId));
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        // Plan enforcement: AI-video feature flag, then social-AI feature + monthly cap.
        // 1. Script → slides. 2. Assemble MP4.
        const { slides } = await generateSlideshowScript({
            topic,
            userId,
            brandId,
            slideCount,
        });

        const result = await assembleSlideshow({
            slides,
            userId,
            voice,
        });
        // Record as a media asset so it surfaces in the library + is attachable.
        const filename = `slideshow-${Date.now()}.mp4`;
        const asset = await mediaAssetRepository.create({
            brandId,
            userId,
            url: result.url,
            type: 'video',
            filename,
            originalName: filename,
            mimeType: 'video/mp4',
            size: 0,
            sourcePrompt: topic.slice(0, 500),
            sourceProvider: 'ai-slideshow',
        });

        return NextResponse.json(
            { asset, url: result.url, durationSec: result.durationSec, slideCount: result.slideCount },
            { status: 201 }
        );
    } catch (error) {
        console.error('AI slideshow generation error:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to generate slideshow' },
            { status: 500 }
        );
    }
}
