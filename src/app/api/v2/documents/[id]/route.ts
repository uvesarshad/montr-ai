import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { documentRepository } from '@/lib/db/repository/document.repository';

import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { knowledgeIngestionService } from '@/lib/knowledge-base/knowledge-ingestion.service';
import FormModel from '@/lib/db/models/form.model';

const updateDocumentSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    content: z.string().optional(),
    referenceId: z.string().nullable().optional(),
    referenceType: z.string().nullable().optional(),
    isPublished: z.boolean().optional(),
    publishedUsername: z.string().optional(),
    coverImage: z.string().url().optional(),
    isPasswordProtected: z.boolean().optional(),
    password: z.string().nullable().optional(),
});

/**
 * GET /api/v2/documents/[id]
 * Get a specific document by ID
 */
export async function GET(
    _request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session || !session.user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const userId = session.user.id!;
        const firebaseUid = session.user.firebaseUid;

        // Pass firebaseUid to support migrated users
        const document = await documentRepository.findById(params.id, userId, firebaseUid);

        if (!document) {
            return NextResponse.json(
                { error: 'Document not found' },
                { status: 404 }
            );
        }

        return NextResponse.json(document);
    } catch (error) {
        console.error('Error fetching document:', error);
        return NextResponse.json(
            { error: 'Failed to fetch document' },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/v2/documents/[id]
 * Update a document
 */
export async function PATCH(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session || !session.user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const userId = session.user.id!;
        const firebaseUid = session.user.firebaseUid;
        const body = await request.json();

        // Validate input
        const validatedData = updateDocumentSchema.parse(body);
        const updateData: Record<string, unknown> = { ...validatedData };

        // Handle Password Hashing
        if (validatedData.password !== undefined) {
            if (validatedData.password && validatedData.password.trim() !== '') {
                const salt = await bcrypt.genSalt(10);
                updateData.password = await bcrypt.hash(validatedData.password, salt);
                updateData.isPasswordProtected = true;
            } else {
                updateData.password = null;
                updateData.isPasswordProtected = false;
            }
        }

        // Handle Publishing Slug Generation
        if (validatedData.isPublished) {
            // Check if we have title in update, otherwise fetch doc
            let title = validatedData.title;
            if (!title) {
                const existingDoc = await documentRepository.findById(params.id, userId, firebaseUid);
                if (existingDoc) title = existingDoc.title;
            }

            if (title) {
                const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + params.id;
                updateData.publishedSlug = slug;
                // Set username if not provided
                if (!updateData.publishedUsername) {
                    updateData.publishedUsername = session.user.username || session.user.email?.split('@')[0];
                }
            }
        }

        // Pass firebaseUid to support migrated users
        const document = await documentRepository.update(params.id, userId, updateData, firebaseUid);

        if (!document) {
            return NextResponse.json(
                { error: 'Document not found' },
                { status: 404 }
            );
        }

        // Sync linkedDocId back to the form when a doc is linked to a form
        if (validatedData.referenceType === 'form' && validatedData.referenceId) {
            FormModel.findOneAndUpdate(
                { _id: validatedData.referenceId, userId },
                { $set: { linkedDocId: params.id } }
            ).exec().catch(e => console.error('Failed to sync linkedDocId on form:', e));
        } else if (validatedData.referenceType === null && document.referenceType === 'form' && document.referenceId) {
            // Doc was unlinked from a form — clear the back-link
            FormModel.findOneAndUpdate(
                { _id: document.referenceId, userId },
                { $set: { linkedDocId: null } }
            ).exec().catch(e => console.error('Failed to clear linkedDocId on form:', e));
        }

        // Background sync to Knowledge Base (Non-blocking)
        knowledgeIngestionService.ingestDocument(document).catch(e => console.error("Index error:", e));

        // Near-instant push to a linked Notion page when content changed.
        // Fire-and-forget; debounced + direction-gated downstream.
        if (validatedData.content !== undefined) {
            import('@/lib/queue/queue')
                .then(({ enqueueNotionDocPush }) => enqueueNotionDocPush(params.id))
                .catch(e => console.error('Failed to enqueue Notion push:', e));
        }

        return NextResponse.json(document);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid input', details: error.errors },
                { status: 400 }
            );
        }

        console.error('Error updating document:', error);
        return NextResponse.json(
            { error: 'Failed to update document' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/v2/documents/[id]
 * Delete a document
 */
export async function DELETE(
    _request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    const params = await props.params;
    try {
        const session = await getSession();

        if (!session || !session.user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const userId = session.user.id!;
        const firebaseUid = session.user.firebaseUid;

        // Pass firebaseUid to support migrated users
        const success = await documentRepository.delete(params.id, userId, firebaseUid);

        if (!success) {
            return NextResponse.json(
                { error: 'Document not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting document:', error);
        return NextResponse.json(
            { error: 'Failed to delete document' },
            { status: 500 }
        );
    }
}
