import { NextRequest, NextResponse } from 'next/server';
import { canvasRepository } from '@/lib/db/repository/canvas.repository';
import { uploadBase64, generateCanvasPreviewKey } from '@/lib/storage/upload';

/**
 * POST /api/v2/canvases/[id]/preview
 * Upload canvas preview to S3
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { previewData, userId } = body;

        if (!previewData || !userId) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Generate S3 key
        const key = generateCanvasPreviewKey(userId, id);

        // Upload to S3
        const result = await uploadBase64(previewData, key, 'image/png');

        // Store the permanent S3 key (not the presigned URL which expires)
        await canvasRepository.update(id, userId, {
            previewKey: result.key,
        });

        return NextResponse.json({
            previewUrl: result.url,
            previewKey: result.key,
        });
    } catch (error) {
        console.error('Error uploading canvas preview:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to upload preview' },
            { status: 500 }
        );
    }
}
