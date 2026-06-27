import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repository/user.repository';
import { dbConnect } from '@/lib/db/connect';
import { S3Provider } from '@/lib/storage/providers/s3-provider';

// Sniff the first few bytes of a buffer and return the canonical MIME type if
// the magic bytes match one of our accepted image formats. Returns null
// otherwise — the caller treats null as "client lied about Content-Type".
function sniffImageMime(buf: Buffer): string | null {
    if (buf.length < 12) return null;
    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
        buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
        buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
    ) return 'image/png';
    // GIF: 'GIF87a' or 'GIF89a'
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
    // WebP: 'RIFF' .... 'WEBP'
    if (
        buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
    ) return 'image/webp';
    return null;
}

function safeFilename(name: string): string {
    const cleaned = name
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-.]+|[-.]+$/g, '');
    return cleaned.slice(0, 80) || 'avatar';
}

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { error: 'Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.' },
                { status: 400 }
            );
        }

        // Validate file size (max 5MB)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            return NextResponse.json(
                { error: 'File too large. Maximum size is 5MB.' },
                { status: 400 }
            );
        }

        // Convert file to buffer
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Magic-byte sniff: the client-declared Content-Type can be forged, so
        // confirm the bytes actually look like a supported image before storing.
        // Normalises 'image/jpg' → 'image/jpeg' on the way out.
        const detectedMime = sniffImageMime(buffer);
        if (!detectedMime) {
            return NextResponse.json(
                { error: 'File contents do not match a supported image format.' },
                { status: 400 }
            );
        }

        // Upload to S3
        const s3Provider = new S3Provider();
        const uploadResult = await s3Provider.upload(buffer, {
            folder: `profile-pictures/${session.user.id}`,
            filename: `${Date.now()}-${safeFilename(file.name)}`,
            contentType: detectedMime,
            isPublic: true,
        });

        // Update user's image field
        await dbConnect();
        const updatedUser = await userRepository.update(session.user.id!, {
            image: uploadResult.url,
        });

        return NextResponse.json({
            success: true,
            imageUrl: uploadResult.url,
            user: updatedUser,
        });
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        return NextResponse.json(
            { error: 'Failed to upload profile picture' },
            { status: 500 }
        );
    }
}
