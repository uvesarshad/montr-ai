import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { generateImage } from '@/ai/flows/generate-image-flow';
import { uploadBase64, generateUserFileKey, getPresignedUrl } from '@/lib/storage/upload';
import { S3Provider } from '@/lib/storage/providers/s3-provider';
import { connectDB } from '@/lib/mongodb';
import MediaAsset from '@/lib/db/models/media-asset.model';
import { applyAiRateLimit } from '@/lib/ai/rate-limit';

/**
 * POST /api/v2/ads/generate-creative
 * Generates an ad image at a platform-appropriate size.
 *
 * With `brandId` (the normal path): uploads PUBLIC to storage and saves a
 * media_assets row (tags ['ad-creative'], sourcePrompt) — the image gets a
 * permanent URL and shows up in the brand's media library / the wizard's
 * library picker for reuse.
 *
 * Without `brandId` (fallback): legacy behavior — 24h presigned URL, no
 * library row. Still fine for ad creation: platforms cache the creative
 * into their own CDN when the ad is created.
 */

const PRESETS: Record<string, { aspectRatio: string; label: string }> = {
    square: { aspectRatio: '1:1', label: 'feed (1:1)' },
    story: { aspectRatio: '9:16', label: 'story/reel (9:16)' },
    landscape: { aspectRatio: '16:9', label: 'link ad (landscape)' },
};

const URL_TTL_SECONDS = 24 * 60 * 60;

export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const limited = await applyAiRateLimit(request, 'ai:ads-copy', session.user.id!);
        if (limited) return limited;

        const body = await request.json().catch(() => ({}));
        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
        const presetKey = typeof body.preset === 'string' && PRESETS[body.preset] ? body.preset : 'square';
        const preset = PRESETS[presetKey];
        const brandId = typeof body.brandId === 'string' && body.brandId ? body.brandId : null;

        if (!prompt) {
            return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
        }

        // generateImage handles credit check + consumption itself
        const adPrompt = `Professional advertising creative, ${preset.label} format. ${prompt}. High quality, clean composition, strong focal point, suitable as a paid social/search ad image. No embedded text or logos.`;
        const result = await generateImage({
            prompt: adPrompt,
            aspectRatio: preset.aspectRatio,
        });

        if (!result.imageUrl?.startsWith('data:')) {
            // Some providers already return hosted URLs — pass straight through
            return NextResponse.json({ imageUrl: result.imageUrl, creditsUsed: result.creditsUsed });
        }

        const filename = `ad-creative-${presetKey}-${Date.now()}.png`;

        if (brandId) {
            // Library path: permanent public URL + media_assets row
            const base64String = result.imageUrl.replace(/^data:image\/\w+;base64,/, '');
            const buffer = Buffer.from(base64String, 'base64');

            const provider = new S3Provider();
            const uploaded = await provider.upload(buffer, {
                folder: `ads/creatives/${brandId}`,
                filename,
                contentType: 'image/png',
                isPublic: true,
            });

            await connectDB();
            const asset = await MediaAsset.create({
                brandId,
                userId: session.user.id!,
                url: uploaded.url,
                type: 'image',
                filename,
                originalName: filename,
                mimeType: 'image/png',
                size: uploaded.size,
                tags: ['ad-creative', presetKey],
                sourcePrompt: prompt,
                usageCount: 0,
            });

            return NextResponse.json({
                imageUrl: uploaded.url,
                assetId: String(asset._id),
                savedToLibrary: true,
                creditsUsed: result.creditsUsed,
            });
        }

        // Fallback: ephemeral presigned URL (no brand context)
        const key = generateUserFileKey(session.user.id!, `ads/creatives/${filename}`);
        await uploadBase64(result.imageUrl, key, 'image/png');
        const imageUrl = await getPresignedUrl(key, URL_TTL_SECONDS);

        return NextResponse.json({
            imageUrl,
            key,
            expiresInSeconds: URL_TTL_SECONDS,
            savedToLibrary: false,
            creditsUsed: result.creditsUsed,
        });
    } catch (error) {
        console.error('Ad creative generation error:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to generate creative' },
            { status: 500 }
        );
    }
}
