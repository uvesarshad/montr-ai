import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { whatsappTemplateRepository } from '@/lib/db/repository/whatsapp-template.repository';
import { whatsappAccountRepository } from '@/lib/db/repository/whatsapp-account.repository';

// POST - Upload media for template header (image, video, document)
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const templateId = params.id;
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const mediaType = formData.get('mediaType') as string; // 'image', 'video', 'document'

        if (!file) {
            return NextResponse.json({ error: 'File is required' }, { status: 400 });
        }

        if (!mediaType || !['image', 'video', 'document'].includes(mediaType)) {
            return NextResponse.json(
                { error: 'Valid mediaType is required (image, video, document)' },
                { status: 400 }
            );
        }

        // Get template
        const template = await whatsappTemplateRepository.findById(templateId);
        if (!template) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        // Verify ownership
        // Get account for access token
        const account = await whatsappAccountRepository.findById(
            template.whatsappAccountId.toString()
        );
        if (!account) {
            return NextResponse.json({ error: 'WhatsApp account not found' }, { status: 404 });
        }

        // Convert file to buffer
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Upload to Meta (using resumable upload API)
        // Step 1: Create upload session
        const sessionUrl = `https://graph.facebook.com/v19.0/${account.wabaId}/uploads`;
        const sessionResponse = await fetch(sessionUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${account.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                file_length: buffer.length,
                file_type: file.type,
                file_name: file.name,
            }),
        });

        if (!sessionResponse.ok) {
            const error = await sessionResponse.json();
            console.error('Meta upload session error:', error);
            return NextResponse.json(
                { error: 'Failed to create upload session' },
                { status: sessionResponse.status }
            );
        }

        const sessionData = await sessionResponse.json();
        const uploadSessionId = sessionData.id;

        // Step 2: Upload file data
        const uploadUrl = `https://graph.facebook.com/v19.0/${uploadSessionId}`;
        const uploadResponse = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${account.accessToken}`,
                'file_offset': '0',
            },
            body: buffer,
        });

        if (!uploadResponse.ok) {
            const error = await uploadResponse.json();
            console.error('Meta file upload error:', error);
            return NextResponse.json(
                { error: 'Failed to upload file' },
                { status: uploadResponse.status }
            );
        }

        const uploadData = await uploadResponse.json();
        const mediaHandle = uploadData.h; // Media handle ID

        return NextResponse.json({
            success: true,
            mediaHandle,
            mediaType,
            fileName: file.name,
            fileSize: buffer.length,
            message: 'Media uploaded successfully. Use this handle in template header.',
        });
    } catch (error) {
        console.error('Error uploading media:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
