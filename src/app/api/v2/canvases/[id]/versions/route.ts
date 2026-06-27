import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { canvasRepository } from '@/lib/db/repository/canvas.repository';
import { canvasVersionRepository } from '@/lib/db/repository/canvas-version.repository';

/**
 * GET /api/v2/canvases/[id]/versions
 * List version history (metadata only — no data blobs) for a canvas.
 * Org-scoped: caller must own the canvas (mirrors the canvas [id] route auth).
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const session = await getSession();

        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id!;
        const firebaseUid = session.user.firebaseUid;

        // Authorize: canvas must belong to the session user.
        const canvas = await canvasRepository.findById(id, userId, firebaseUid);
        if (!canvas) {
            return NextResponse.json({ error: 'Canvas not found' }, { status: 404 });
        }

        const versions = await canvasVersionRepository.listMetadata(id);

        return NextResponse.json({
            versions: versions.map(v => ({
                _id: v._id,
                version: v.version,
                saveKind: v.saveKind,
                label: v.label,
                createdAt: v.createdAt,
            })),
        });
    } catch (error) {
        console.error('Error fetching canvas versions:', error);
        return NextResponse.json(
            { error: 'Failed to fetch versions' },
            { status: 500 }
        );
    }
}
