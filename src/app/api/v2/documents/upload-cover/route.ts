import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import DocumentModel from '@/lib/db/models/document.model';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

// POST - Upload cover image
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;
        const documentId = formData.get('documentId') as string;

        if (!file || !documentId) {
            return NextResponse.json(
                { error: 'Missing file or documentId' },
                { status: 400 }
            );
        }

        await dbConnect();

        // Verify document ownership
        const document = await DocumentModel.findOne({
            _id: documentId,
            userId: session.user.id || session.user.id,
        });

        if (!document) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        // Create upload directory
        const uploadDir = join(process.cwd(), 'public', 'uploads', 'covers');
        if (!existsSync(uploadDir)) {
            mkdirSync(uploadDir, { recursive: true });
        }

        // Generate unique filename
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const ext = file.name.split('.').pop();
        const filename = `${documentId}-${Date.now()}.${ext}`;
        const filepath = join(uploadDir, filename);

        // Write file
        await writeFile(filepath, buffer);

        // Update document with cover image URL
        const imageUrl = `/uploads/covers/${filename}`;
        await DocumentModel.updateOne(
            { _id: documentId },
            { coverImage: imageUrl }
        );

        return NextResponse.json({ url: imageUrl });
    } catch (error) {
        console.error('Error uploading cover image:', error);
        return NextResponse.json(
            { error: 'Failed to upload cover image' },
            { status: 500 }
        );
    }
}

// DELETE - Remove cover image
export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { documentId } = await req.json();

        if (!documentId) {
            return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });
        }

        await dbConnect();

        // Verify document ownership
        const document = await DocumentModel.findOne({
            _id: documentId,
            userId: session.user.id || session.user.id,
        });

        if (!document) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        // Delete old file if exists
        if (document.coverImage) {
            const oldFilePath = join(process.cwd(), 'public', document.coverImage);
            if (existsSync(oldFilePath)) {
                await unlink(oldFilePath);
            }
        }

        // Remove cover image from document
        await DocumentModel.updateOne(
            { _id: documentId },
            { $unset: { coverImage: 1 } }
        );

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error removing cover image:', error);
        return NextResponse.json(
            { error: 'Failed to remove cover image' },
            { status: 500 }
        );
    }
}
