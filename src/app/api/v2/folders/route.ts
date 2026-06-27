import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import FolderModel from '@/lib/db/models/folder.model';
import { z } from 'zod';

const createFolderSchema = z.object({
    name: z.string().min(1).max(100),
    parentId: z.string().optional().nullable(),
    referenceId: z.string().optional(),
    referenceType: z.string().optional(),
});

/**
 * GET /api/v2/folders
 * List folders.
 * Query Params:
 * - parentId: string ('null' or id). If missing, defaults to 'null' (root).
 * - referenceId: string (optional module filter)
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id!;
        const { searchParams } = new URL(request.url);

        let parentId: string | null = searchParams.get('parentId');
        const referenceId = searchParams.get('referenceId');

        // Handle 'null' string explicitly
        if (parentId === 'null' || parentId === 'root') {
            parentId = null;
        }

        const query: Record<string, unknown> = { userId };

        // If parentId is provided (or explicitly null), filter by it.
        // If undefined in query, we might want all folders? 
        // Usually file explorers want level-by-level. Let's default to root if not specified.
        if (parentId !== undefined) {
            query.parentId = parentId;
        } else if (!referenceId) {
            // If no referenceId and no parentId, default to getting root folders
            query.parentId = null;
        }

        if (referenceId) {
            query.referenceId = referenceId;
        }

        const folders = await FolderModel.find(query).sort({ name: 1 });

        return NextResponse.json({ folders });
    } catch (error) {
        console.error('Error fetching folders:', error);
        return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 });
    }
}

/**
 * POST /api/v2/folders
 * Create a new folder
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id!;
        const body = await request.json();

        const validated = createFolderSchema.parse(body);
        const folder = await FolderModel.create({
            userId,
            name: validated.name,
            parentId: validated.parentId || null,
            referenceId: validated.referenceId,
            referenceType: validated.referenceType,
        });

        return NextResponse.json(folder, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
        }
        console.error('Error creating folder:', error);
        return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
    }
}
