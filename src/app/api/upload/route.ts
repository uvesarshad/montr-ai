import { NextRequest, NextResponse } from 'next/server';
import { S3Provider } from '@/lib/storage/providers/s3-provider';
import { checkFormSubmissionRateLimit, getClientIp } from '@/lib/rate-limiter';

// Public file uploads for embedded form fields. The endpoint is unauthenticated
// by design (forms are filled in by anonymous visitors), so it must defend
// itself with strict type/size/name limits and IP-based rate limiting.

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = new Set<string>([
    // Images
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    // Documents
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'application/msword', // .doc (legacy)
    'application/vnd.ms-excel', // .xls (legacy)
]);

function sanitizeFilename(name: string): string {
    // Keep extension; replace any character that isn't [a-z0-9._-] with '-'.
    // Collapse runs of '-' and cap length to keep S3 keys sane.
    const cleaned = name
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-.]+|[-.]+$/g, '');
    return cleaned.slice(0, 80) || 'upload';
}

export async function POST(req: NextRequest) {
    try {
        // Rate limit by IP — public endpoint, treat each remote as a form
        // submitter and reuse the form-submission limiter (10/hr per IP).
        const ip = getClientIp(req.headers);
        const rateLimit = await checkFormSubmissionRateLimit('public-upload', ip);
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { error: 'Too many uploads. Please try again later.' },
                { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
            );
        }

        const formData = await req.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Size check — Next's body limit (4.5MB by default) will also bite, but
        // this gives a clear error message before we read the buffer.
        if (file.size > MAX_UPLOAD_BYTES) {
            return NextResponse.json(
                { error: `File too large. Maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.` },
                { status: 413 }
            );
        }

        // Type check against a strict whitelist. The client-declared MIME can
        // be lied about — that's the next hardening pass (magic-byte sniff via
        // file-type) but a whitelist already blocks most malicious uploads.
        if (!ALLOWED_MIME_TYPES.has(file.type)) {
            return NextResponse.json(
                { error: `Unsupported file type: ${file.type || 'unknown'}` },
                { status: 400 }
            );
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const provider = new S3Provider();

        const filename = `${Date.now()}-${sanitizeFilename(file.name)}`;
        const result = await provider.upload(buffer, {
            folder: 'uploads/forms',
            filename,
            contentType: file.type,
            isPublic: true,
        });

        return NextResponse.json({ url: result.url });

    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}
