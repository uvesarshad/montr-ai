import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import { generateImage } from '@/ai/flows/generate-image-flow';
import { mediaAssetRepository } from '@/lib/db/repository/media-asset.repository';
import { S3Provider } from '@/lib/storage/providers/s3-provider';
import { applyAiRateLimit } from '@/lib/ai/rate-limit';
import { assertBrandAccess, brandAccessErrorResponse, BrandAccessError } from '@/lib/social/brand-access';

/**
 * POST /api/social/media/generate
 *
 * Generate an image from a text prompt with the shared `generate-image-flow`
 * (audit §E — the flow existed but was never wired into the social media
 * library), persist it to storage exactly like an upload, and record it as a
 * MediaAsset with generation provenance (sourcePrompt / sourceProvider).
 *
 * Mirrors the gating of the other social AI endpoints
 * (`/api/social/ai/enhance`): AI rate-limit + plan feature/cap gate, metered
 * after a successful generation. Org-less personal accounts skip the plan gate.
 */

const GenerateBodySchema = z.object({
    brandId: z.string().min(1, 'brandId is required'),
    prompt: z.string().min(1, 'A prompt is required').max(2000),
    aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).optional(),
});

/** Map a generated-image data URI to a buffer + mime/extension. */
function parseDataUri(dataUri: string): { buffer: Buffer; mimeType: string; ext: string } | null {
    const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(dataUri);
    if (!match) return null;
    const mimeType = match[1] || 'image/png';
    const isBase64 = Boolean(match[2]);
    const data = match[3];
    const buffer = isBase64 ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data), 'utf-8');
    const ext = mimeType.split('/')[1]?.split('+')[0] || 'png';
    return { buffer, mimeType, ext };
}

export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const limited = await applyAiRateLimit(request, 'ai:social-image', session.user.id);
        if (limited) return limited;

        const parsed = GenerateBodySchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message || 'Invalid request' },
                { status: 400 }
            );
        }
        const { brandId, prompt, aspectRatio } = parsed.data;

        // Never trust the client brandId — verify ownership against the session
        // user and resolve the org from the brand/user record.
        try {
            ({ } = await assertBrandAccess(session.user.id, brandId));
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        // Plan enforcement: social AI feature flag + monthly generation cap.
        // Org-less personal accounts are not gated/metered.
        const result = await generateImage({ prompt, aspectRatio });
        if (!result?.imageUrl) {
            return NextResponse.json({ error: 'Image generation failed' }, { status: 502 });
        }

        const parsedImage = parseDataUri(result.imageUrl);
        if (!parsedImage) {
            return NextResponse.json({ error: 'Generated image was not in a storable format' }, { status: 502 });
        }
        const { buffer, mimeType, ext } = parsedImage;

        // Persist through the same storage path uploads use.
        const provider = new S3Provider();
        const folder = `uploads/social/${session.user.id}`;
        const filename = `ai-${Date.now()}.${ext}`;
        const upload = await provider.upload(buffer, {
            folder,
            filename,
            contentType: mimeType,
            isPublic: true,
        });
        const asset = await mediaAssetRepository.create({
            brandId,
            userId: session.user.id,
            url: upload.url,
            type: 'image',
            filename,
            originalName: filename,
            mimeType,
            size: buffer.length,
            sourcePrompt: prompt,
            sourceProvider: result.modelUsed || 'ai',
        });

        return NextResponse.json({ asset }, { status: 201 });
    } catch (error) {
        console.error('AI image generation error:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to generate image' },
            { status: 500 }
        );
    }
}
