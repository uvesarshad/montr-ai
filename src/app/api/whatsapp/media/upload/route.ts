import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappAccountRepository } from '@/lib/db/repository/whatsapp-account.repository';
import { mediaHandlerService } from '@/lib/services/media-handler.service';

/**
 * POST /api/whatsapp/media/upload
 * Upload media file to WhatsApp (Meta Graph API)
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;
        const accountId = formData.get('accountId') as string;

        if (!file || !accountId) {
            return NextResponse.json(
                { error: 'File and accountId are required' },
                { status: 400 }
            );
        }

        // Get WhatsApp account
        const account = await whatsappAccountRepository.findById(accountId);
        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        // Verify account belongs to organization
        // Convert file to buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Validate media type
        const mediaType = file.type.startsWith('image/') ? 'image' :
            file.type.startsWith('video/') ? 'video' :
                file.type.startsWith('audio/') ? 'audio' : 'document';

        if (!mediaHandlerService.isValidMediaType(file.type, mediaType)) {
            return NextResponse.json(
                { error: `Unsupported media type: ${file.type}` },
                { status: 400 }
            );
        }

        // Upload to Meta
        const result = await mediaHandlerService.uploadMedia(account, buffer, file.type);

        return NextResponse.json({
            mediaId: result.mediaId,
            mediaType,
            fileName: file.name,
            mimeType: file.type,
            size: file.size,
        });
    } catch (error) {
        console.error('Error uploading media:', error);
        return NextResponse.json(
            { error: 'Failed to upload media', details: (error instanceof Error ? error.message : String(error)) },
            { status: 500 }
        );
    }
}
