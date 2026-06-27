import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { canvasRepository } from '@/lib/db/repository/canvas.repository';
import { canvasVersionRepository } from '@/lib/db/repository/canvas-version.repository';
import { syncCanvasWorkflow, type CanvasDoc } from '@/lib/workflow/canvas-sync';
import { getPresignedUrl } from '@/lib/storage/upload';
import { z } from 'zod';

/**
 * After a canvas save, refresh its UnifiedWorkflow shadow + trigger so that
 * event/webhook/cron-triggered canvases go live without a manual first run.
 * Fire-safe: a sync failure must never fail the save.
 */
async function syncCanvasWorkflowSafe(
    canvas: CanvasDoc,
    userId: string,
    dataChanged: boolean
): Promise<void> {
    if (!dataChanged || !canvas?.data) return;
    try {
        await syncCanvasWorkflow(canvas, { userId });
    } catch (err) {
        console.error('[Canvas save] trigger sync failed (save preserved):', err);
    }
}

/**
 * Snapshot the canvas into version history. Fire-safe: a snapshot failure must
 * never fail the save. Policy lives in the repository (manual always; auto
 * throttled to 1 per 10min; skip unchanged; prune to a per-canvas cap).
 */
async function snapshotCanvasVersionSafe(
    canvasId: string,
    data: string | undefined,
    userId: string,
    saveKind: 'manual' | 'auto'
): Promise<void> {
    if (!data) return;
    try {
        await canvasVersionRepository.snapshot({
            canvasId,
            userId,
            data,
            saveKind,
        });
    } catch (err) {
        console.error('[Canvas save] version snapshot failed (save preserved):', err);
    }
}

const updateCanvasSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    data: z.string().optional(),
    previewKey: z.string().optional(),
    saveKind: z.enum(['manual', 'auto']).optional(),
});

/**
 * When a canvas is deleted, tear down its UnifiedWorkflow shadow and remove any
 * BullMQ repeatable job that survives in Redis. Without this the scheduler keeps
 * firing the orphaned cron forever. Fire-safe: never throws.
 */
async function cleanupCanvasWorkflowSafe(canvasId: string): Promise<void> {
    try {
        const { UnifiedWorkflow } = await import('@/lib/db/models/unified-workflow.model');
        const workflow = await UnifiedWorkflow.findOne({ canvasId }).select('_id').lean();
        if (!workflow) return;

        const workflowId = String(workflow._id);
        const { unregisterScheduledWorkflow } = await import('@/lib/workflow/queue/scheduler');
        await unregisterScheduledWorkflow(workflowId);
        // H5: also tear down any polling repeatable for this workflow.
        const { unregisterPollingWorkflow } = await import('@/lib/workflow/queue/polling-scheduler');
        await unregisterPollingWorkflow(workflowId);
        await UnifiedWorkflow.deleteOne({ _id: workflow._id });
    } catch (err) {
        console.error('[Canvas delete] workflow cleanup failed (canvas already deleted):', err);
    }
}

/**
 * POST /api/v2/canvases/[id]
 * Handle sendBeacon auto-save requests (sent on page unload)
 * sendBeacon sends data as text/plain, so we need to handle both formats
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const session = await getSession();

        if (!session || !session.user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const userId = session.user.id!;
        const firebaseUid = session.user.firebaseUid;

        // Handle both JSON and text/plain content types (sendBeacon uses text/plain)
        let body: Record<string, unknown>;
        const contentType = request.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            body = await request.json();
        } else {
            // sendBeacon sends as text/plain
            const text = await request.text();
            try {
                body = JSON.parse(text);
            } catch {
                return NextResponse.json(
                    { error: 'Invalid JSON in request body' },
                    { status: 400 }
                );
            }
        }

        // Validate input
        const { saveKind, ...validatedData } = updateCanvasSchema.parse(body);

        // Pass firebaseUid to support migrated users
        const canvas = await canvasRepository.update(id, userId, validatedData, firebaseUid);

        if (!canvas) {
            return NextResponse.json(
                { error: 'Canvas not found' },
                { status: 404 }
            );
        }

        await syncCanvasWorkflowSafe(canvas as unknown as CanvasDoc, userId, validatedData.data !== undefined);
        // sendBeacon/unload saves are auto-saves by nature.
        await snapshotCanvasVersionSafe(id, validatedData.data, userId, saveKind ?? 'auto');

        console.log('[POST Canvas] Auto-save via sendBeacon successful for canvas:', id);
        return NextResponse.json({ success: true });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid input', details: error.errors },
                { status: 400 }
            );
        }

        console.error('Error auto-saving canvas:', error);
        return NextResponse.json(
            { error: 'Failed to auto-save canvas' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/v2/canvases/[id]
 * Get a specific canvas by ID
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
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
        const canvas = await canvasRepository.findById(id, userId, firebaseUid);

        if (!canvas) {
            return NextResponse.json(
                { error: 'Canvas not found' },
                { status: 404 }
            );
        }

        // Convert to plain object and generate fresh presigned URL
        const canvasObj = canvas.toObject ? canvas.toObject() : canvas;

        // Determine the S3 key - use previewKey or extract from legacy previewUrl
        let s3Key = canvasObj.previewKey;

        // Legacy support: extract key from old previewUrl if previewKey is missing
        if (!s3Key && canvasObj.previewUrl) {
            try {
                const url = new URL(canvasObj.previewUrl);
                s3Key = decodeURIComponent(url.pathname.slice(1));
            } catch {
                // Invalid URL format, skip
            }
        }

        // Generate fresh presigned URL if we have a key
        if (s3Key) {
            try {
                canvasObj.previewUrl = await getPresignedUrl(s3Key, 3600);
                // Also update the canvas with the extracted key for future requests
                if (!canvasObj.previewKey && s3Key) {
                    canvasObj.previewKey = s3Key;
                    canvasRepository.update(id, userId, { previewKey: s3Key }, firebaseUid).catch(() => { });
                }
            } catch (error) {
                console.error(`Failed to generate presigned URL for canvas ${id}:`, error);
                canvasObj.previewUrl = null;
            }
        }

        return NextResponse.json(canvasObj);
    } catch (error) {
        console.error('Error fetching canvas:', error);
        return NextResponse.json(
            { error: 'Failed to fetch canvas' },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/v2/canvases/[id]
 * Update a canvas
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
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
        const { saveKind, ...validatedData } = updateCanvasSchema.parse(body);

        // Pass firebaseUid to support migrated users
        const canvas = await canvasRepository.update(id, userId, validatedData, firebaseUid);

        if (!canvas) {
            return NextResponse.json(
                { error: 'Canvas not found' },
                { status: 404 }
            );
        }

        await syncCanvasWorkflowSafe(canvas as unknown as CanvasDoc, userId, validatedData.data !== undefined);
        await snapshotCanvasVersionSafe(id, validatedData.data, userId, saveKind ?? 'auto');

        return NextResponse.json(canvas);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid input', details: error.errors },
                { status: 400 }
            );
        }

        console.error('Error updating canvas:', error);
        return NextResponse.json(
            { error: 'Failed to update canvas' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/v2/canvases/[id]
 * Delete a canvas
 */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
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
        const success = await canvasRepository.delete(id, userId, firebaseUid);

        if (!success) {
            return NextResponse.json(
                { error: 'Canvas not found' },
                { status: 404 }
            );
        }

        // Tear down the UnifiedWorkflow shadow + any Redis/BullMQ repeatable job
        // so a deleted scheduled canvas stops firing. Fire-safe: cleanup failure
        // must never fail the delete (the canvas is already gone).
        await cleanupCanvasWorkflowSafe(id);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting canvas:', error);
        return NextResponse.json(
            { error: 'Failed to delete canvas' },
            { status: 500 }
        );
    }
}
