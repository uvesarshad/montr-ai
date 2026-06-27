import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { S3Provider } from '@/lib/storage/providers/s3-provider';

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        
        const provider = new S3Provider();

        const path = `uploads/social/${session.user.id || 'anonymous'}`;
        const filename = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;

        const result = await provider.upload(buffer, {
            folder: path,
            filename: filename,
            contentType: file.type,
            isPublic: true
        });

        return NextResponse.json({ url: result.url });

    } catch (error) {
        return NextResponse.json({ 
            error: 'Upload failed',
            details: error instanceof Error ? (error.message || error.name) : String(error)
        }, { status: 500 });
    }
}
