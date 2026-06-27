import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { canvasRepository } from '@/lib/db/repository/canvas.repository';
import { canvasVersionRepository } from '@/lib/db/repository/canvas-version.repository';

/**
 * POST /api/v2/canvases/[id]/versions/[versionId]/restore
 * Restore a snapshot back into canvas.data. Takes a safety snapshot of the
 * current state first, then writes the chosen version's data and bumps history.
 * Org-scoped: caller must own the canvas (mirrors the canvas [id] route auth).
 */
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; versionId: string }> }
) {
    try {
        const { id, versionId } = await params;
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

        // Fetch the version to restore (scoped to this canvas).
        const version = await canvasVersionRepository.findById(versionId, id);
        if (!version) {
            return NextResponse.json({ error: 'Version not found' }, { status: 404 });
        }
        // Safety snapshot of the current state before overwriting it.
        if (canvas.data) {
            try {
                await canvasVersionRepository.forceSnapshot({
                    canvasId: id,
                    userId,
                    data: canvas.data,
                    saveKind: 'manual',
                    label: `Backup before restoring to v${version.version}`,
                });
            } catch (err) {
                console.error('[Canvas restore] safety snapshot failed (continuing):', err);
            }
        }

        // Write the snapshot back to the canvas.
        const updated = await canvasRepository.update(
            id,
            userId,
            { data: version.data },
            firebaseUid
        );

        if (!updated) {
            return NextResponse.json({ error: 'Canvas not found' }, { status: 404 });
        }

        // Record the restore as a new version so history reflects the new HEAD.
        try {
            await canvasVersionRepository.forceSnapshot({
                canvasId: id,
                userId,
                data: version.data,
                saveKind: 'manual',
                label: `Restored from v${version.version}`,
            });
        } catch (err) {
            console.error('[Canvas restore] post-restore snapshot failed (continuing):', err);
        }

        // Refresh the UnifiedWorkflow shadow + trigger. Fire-safe.
        try {
        } catch (err) {
            console.error('[Canvas restore] trigger sync failed (restore preserved):', err);
        }

        return NextResponse.json({
            success: true,
            data: version.data,
        });
    } catch (error) {
        console.error('Error restoring canvas version:', error);
        return NextResponse.json(
            { error: 'Failed to restore version' },
            { status: 500 }
        );
    }
}
