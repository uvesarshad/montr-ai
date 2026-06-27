import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { canvasRepository } from '@/lib/db/repository/canvas.repository';
import { getPresignedUrl } from '@/lib/storage/upload';
import { z } from 'zod';
import { UnifiedWorkflow } from '@/lib/db/models/unified-workflow.model';

// Validation schemas
const createCanvasSchema = z.object({
    name: z.string().min(1).max(100),
    data: z.string().optional(),
    brandId: z.string().nullable().optional(),
});

/**
 * GET /api/v2/canvases
 * Get all canvases for the authenticated user
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
        const firebaseUid = session.user.firebaseUid;

        const { searchParams } = new URL(request.url);
        const sortBy = searchParams.get('sortBy') as 'updatedAt' | 'name' || 'updatedAt';
        // Agency mode: read brandId from query (set by client via useCurrentBrand).
        // Empty string / `all` / missing → unfiltered (All brands).
        const rawBrand = searchParams.get('brandId');
        const brandId = rawBrand && rawBrand !== 'all' && rawBrand !== '' ? rawBrand : undefined;

        // Pass firebaseUid to support migrated users
        const canvases = await canvasRepository.findByUserId(userId, sortBy, firebaseUid, brandId);



        // ... (keep existing imports)

        // ... inside GET function ...

        // Generate fresh presigned URLs for each canvas with a previewKey
        const canvasesWithUrls = await Promise.all(
            canvases.map(async (canvas) => {
                const canvasObj = canvas.toObject ? canvas.toObject() : canvas;

                // Determine the S3 key - use previewKey or extract from legacy previewUrl
                let s3Key = canvasObj.previewKey;

                // Legacy support: extract key from old previewUrl if previewKey is missing
                if (!s3Key && canvasObj.previewUrl) {
                    try {
                        const url = new URL(canvasObj.previewUrl);
                        // The path after bucket name contains the key (e.g., /users/userId/canvases/canvasId/preview.png)
                        // Remove leading slash
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
                            // Update in DB (async, non-blocking)
                            canvasRepository.update(canvasObj._id, userId, { previewKey: s3Key }, firebaseUid).catch(() => { });
                        }
                    } catch (error) {
                        console.error(`Failed to generate presigned URL for canvas ${canvasObj._id}:`, error);
                        canvasObj.previewUrl = null;
                    }
                }

                // Fetch workflow stats
                try {
                    const workflow = await UnifiedWorkflow.findOne({ canvasId: canvasObj._id })
                        .select('executionCount status lastExecutedAt')
                        .lean();

                    canvasObj.stats = {
                        executionCount: workflow?.executionCount || 0,
                        isActive: workflow?.status === 'active',
                        lastExecutedAt: workflow?.lastExecutedAt
                    };
                } catch (error) {
                    console.error('Error fetching workflow stats for canvas:', canvasObj._id, error);
                    canvasObj.stats = {
                        executionCount: 0,
                        isActive: false
                    };
                }

                return canvasObj;
            })
        );

        return NextResponse.json({
            canvases: canvasesWithUrls,
            count: canvasesWithUrls.length,
        });
    } catch (error) {
        console.error('Error fetching canvases:', error);
        const isProd = process.env.NODE_ENV === 'production';
        return NextResponse.json(
            {
                error: 'Failed to fetch canvases',
                ...(isProd ? {} : { detail: error instanceof Error ? error.message : String(error) }),
            },
            { status: 500 }
        );
    }
}


/**
 * POST /api/v2/canvases
 * Create a new canvas
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

        // Check plan limit BEFORE creating canvas
        try {
            const { checkPlanLimit } = await import('@/lib/plan-enforcement');
            const canCreate = await checkPlanLimit(userId, 'canvases', 'maxCanvases');

            console.log('[POST /api/v2/canvases] Plan check result:', {
                userId,
                allowed: canCreate.allowed,
                current: canCreate.current,
                limit: canCreate.limit,
                message: canCreate.message,
            });

            // Only block if the check definitively says not allowed AND has a real limit set
            // (limit === 0 usually means "couldn't determine plan", so we fail-open)
            if (!canCreate.allowed && canCreate.limit > 0) {
                return NextResponse.json({
                    error: 'Plan limit reached',
                    message: canCreate.message,
                    current: canCreate.current,
                    limit: canCreate.limit,
                    upgradeRequired: true
                }, { status: 403 });
            }
        } catch (planError) {
            // If plan enforcement itself throws, log it but don't block creation
            console.error('[POST /api/v2/canvases] Plan check failed (allowing creation):', planError);
        }

        // Validate input
        const validatedData = createCanvasSchema.parse(body);

        // Create canvas with the MongoDB user ID (not Firebase UID).
        // brandId is optional — when set by the brand picker, the new canvas
        // is scoped to that brand. When unset, it's org-wide.
        const canvas = await canvasRepository.create({
            userId,
            brandId: validatedData.brandId ?? undefined,
            name: validatedData.name,
            data: validatedData.data,
        });

        return NextResponse.json(canvas, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid input', details: error.errors },
                { status: 400 }
            );
        }

        console.error('Error creating canvas:', error);
        return NextResponse.json(
            { error: 'Failed to create canvas' },
            { status: 500 }
        );
    }
}
