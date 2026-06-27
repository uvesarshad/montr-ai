import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { documentRepository } from '@/lib/db/repository/document.repository';
import DocumentModel from '@/lib/db/models/document.model';
import DocCollaboratorModel from '@/lib/db/models/doc-collaborator.model';
import FolderModel from '@/lib/db/models/folder.model';
import { z } from 'zod';
import { knowledgeIngestionService } from '@/lib/knowledge-base/knowledge-ingestion.service';

const createDocumentSchema = z.object({
    title: z.string().min(1).max(200),
    content: z.string().optional(),
    folderId: z.string().optional().nullable(),
    referenceId: z.string().optional().nullable(),
    referenceType: z.string().optional().nullable(),
});

/**
 * GET /api/v2/documents
 * Get documents.
 * Query Params:
 * - folderId: string (optional).
 * - view: 'mine' | 'shared' (default 'mine')
 * - sortBy: 'updatedAt' | 'title'
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session || !session.user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const userId = session.user.id!;
        // const firebaseUid = session.user.firebaseUid; // Legacy support if needed
        const { searchParams } = new URL(request.url);
        const sortBy = searchParams.get('sortBy') as 'updatedAt' | 'title' || 'updatedAt';
        const view = searchParams.get('view') || 'mine';
        const folderId = searchParams.get('folderId');
        const referenceId = searchParams.get('referenceId');
        const referenceType = searchParams.get('referenceType');
        const scope = searchParams.get('scope');

        const sortOrder: Record<string, 1 | -1> = sortBy === 'updatedAt' ? { updatedAt: -1 } : { title: 1 };
        const userEmail = session.user.email!;

        // 1. Shared View
        if (view === 'shared') {
            // Find docs where I am a collaborator
            const collaborations = await DocCollaboratorModel.find({
                resourceType: 'document',
                $or: [
                    { userId: userId },
                    { email: userEmail }
                ]
            });

            const docIds = collaborations.map(c => c.resourceId);

            // Also find folders I am a collaborator on, but strictly asking for DOCS here.
            // If I am a collab on a folder, do I see all its docs in "Shared with me" flat list?
            // Usually "Shared with me" shows the Folder itself, and you navigate into it.
            // So for /documents?view=shared, we only show directly shared documents.

            const documents = await DocumentModel.find({ _id: { $in: docIds } }).sort(sortOrder);

            return NextResponse.json({ documents, count: documents.length });
        }

        if (referenceId || referenceType) {
            const documents = await DocumentModel.find({
                userId,
                ...(referenceId ? { referenceId } : {}),
                ...(referenceType ? { referenceType } : {}),
            }).sort(sortOrder);

            return NextResponse.json({
                documents,
                count: documents.length,
            });
        }

        if (scope === 'all') {
            const documents = await DocumentModel.find({ userId }).sort(sortOrder);
            return NextResponse.json({
                documents,
                count: documents.length,
            });
        }

        // 2. Folder View (Specific Folder)
        if (folderId && folderId !== 'null' && folderId !== 'root') {
            // Check access to folder
            const folder = await FolderModel.findById(folderId);
            if (!folder) {
                return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
            }

            const isOwner = folder.userId === userId;
            let hasAccess = isOwner;

            if (!hasAccess) {
                // Check collaboration
                const collab = await DocCollaboratorModel.findOne({
                    resourceId: folderId,
                    resourceType: 'folder',
                    $or: [{ userId }, { email: userEmail }]
                });
                if (collab) hasAccess = true;
            }

            if (!hasAccess) {
                return NextResponse.json({ error: 'Unauthorized access to folder' }, { status: 403 });
            }

            // Return docs in this folder
            const documents = await DocumentModel.find({ folderId }).sort(sortOrder);
            return NextResponse.json({ documents, count: documents.length });
        }

        // 3. Root View (My Docs at Root)
        // Default: view='mine' and no folderId
        const documents = await DocumentModel.find({
            userId,
            folderId: null // Only root docs
        }).sort(sortOrder);

        return NextResponse.json({
            documents,
            count: documents.length,
        });

    } catch (error) {
        console.error('Error fetching documents:', error);
        return NextResponse.json(
            { error: 'Failed to fetch documents' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/v2/documents
 * Create a new document
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session || !session.user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const userId = session.user.id!;
        const body = await request.json();

        // Resolve organizationId for multi-tenancy (non-blocking if missing)
        // Check plan limit BEFORE creating document
        const { checkPlanLimit } = await import('@/lib/plan-enforcement');
        const canCreate = await checkPlanLimit(userId, 'documents', 'maxDocuments');

        if (!canCreate.allowed) {
            return NextResponse.json({
                error: 'Plan limit reached',
                message: canCreate.message,
                current: canCreate.current,
                limit: canCreate.limit,
                upgradeRequired: true
            }, { status: 403 });
        }

        // Validate input
        const validatedData = createDocumentSchema.parse(body);

        // Verify Folder Access if provided
        if (validatedData.folderId) {
            const folder = await FolderModel.findOne({ _id: validatedData.folderId, userId });
            // Only owner can create docs in folder for now? 
            // Or editors too. Editors should be able to.
            if (!folder) {
                // Check editor access
                const collab = await DocCollaboratorModel.findOne({
                    resourceId: validatedData.folderId,
                    resourceType: 'folder',
                    role: 'editor',
                    $or: [{ userId }, { email: session.user.email }]
                });

                if (!collab) {
                    return NextResponse.json({ error: 'Folder not found or permission denied' }, { status: 404 });
                }
            }
        }

        // Create document with the MongoDB user ID
        const document = await documentRepository.create({
            userId,
            title: validatedData.title,
            content: validatedData.content,
            folderId: validatedData.folderId,
            referenceId: validatedData.referenceId,
            referenceType: validatedData.referenceType,
        });

        // Background sync to Knowledge Base (Non-blocking)
        knowledgeIngestionService.ingestDocument(document).catch(e => console.error("Index error:", e));

        return NextResponse.json(document, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid input', details: error.errors },
                { status: 400 }
            );
        }

        console.error('Error creating document:', error);
        return NextResponse.json(
            { error: 'Failed to create document' },
            { status: 500 }
        );
    }
}
