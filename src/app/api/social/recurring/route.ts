import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import ScheduledPost from '@/lib/db/models/scheduled-post.model';
import { scheduledPostRepository } from '@/lib/db/repository/scheduled-post.repository';
import { connectDB } from '@/lib/mongodb';
import {
    assertBrandAccess,
    BrandAccessError,
    brandAccessErrorResponse,
} from '@/lib/social/brand-access';
import { expandRecurrencePreview } from '@/lib/social/recurrence';

/**
 * Recurring-series API (social Epic 5).
 *
 * A "series" is the root recurring post: `recurrence` is set and
 * `parentPostId` is null (children carry parentPostId = root id). This route
 * lists a brand's series and lets the caller cancel one (root + its scheduled
 * children). Every read/write is org/brand scoped via `assertBrandAccess`,
 * which re-derives ownership from the session — never the client-supplied id.
 */

interface SeriesChild {
    id: string;
    scheduledFor: Date;
    status: string;
}

// GET - list recurring series for a brand (root posts: recurrence set, no parent)
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const brandId = searchParams.get('brandId');
        if (!brandId) {
            return NextResponse.json({ error: 'brandId is required' }, { status: 400 });
        }

        try {
            await assertBrandAccess(session.user.id, brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        await connectDB();

        // Series roots for this brand: recurrence present, not a child occurrence.
        const roots = await ScheduledPost.find({
            brandId,
            recurrence: { $ne: null },
            $or: [{ parentPostId: null }, { parentPostId: { $exists: false } }],
        })
            .sort({ scheduledFor: 1 })
            .exec();

        const series = await Promise.all(
            roots.map(async (root) => {
                const rootId = String(root._id);

                // Upcoming children still on the calendar.
                const children = await ScheduledPost.find({
                    parentPostId: rootId,
                    status: { $in: ['scheduled', 'publishing'] },
                })
                    .select('scheduledFor status')
                    .sort({ scheduledFor: 1 })
                    .exec();

                const upcomingChildren: SeriesChild[] = children.map((c) => ({
                    id: String(c._id),
                    scheduledFor: c.scheduledFor,
                    status: c.status,
                }));

                // Best-effort preview of upcoming occurrences from the rule.
                const preview = root.recurrence
                    ? expandRecurrencePreview(root.recurrence, new Date(), 5)
                    : [];

                return {
                    id: rootId,
                    brandId: root.brandId,
                    content: root.content,
                    platforms: root.platforms,
                    scheduledFor: root.scheduledFor,
                    timezone: root.timezone,
                    status: root.status,
                    recurrence: root.recurrence,
                    upcomingCount: upcomingChildren.length,
                    upcomingChildren,
                    previewOccurrences: preview,
                };
            }),
        );

        return NextResponse.json({ series });
    } catch (error) {
        console.error('Error listing recurring series:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to list recurring series' },
            { status: 500 },
        );
    }
}

/**
 * Cancel a recurring series. Cancels the root (if still scheduled) and all of
 * its scheduled/unpublished children. `?seriesId=` is the root post id.
 * PATCH and DELETE share the same semantics (PATCH = cancel-in-place).
 */
async function cancelSeries(request: NextRequest): Promise<NextResponse> {
    const session = await getSession();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const seriesId = searchParams.get('seriesId');
    if (!seriesId) {
        return NextResponse.json({ error: 'seriesId is required' }, { status: 400 });
    }

    const root = await scheduledPostRepository.findById(seriesId);
    if (!root) {
        return NextResponse.json({ error: 'Series not found' }, { status: 404 });
    }

    // Tenancy: re-derive brand ownership from the session.
    try {
        await assertBrandAccess(session.user.id, root.brandId);
    } catch (err) {
        if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
        throw err;
    }

    // The supplied id must be a series root (recurrence set, no parent).
    if (!root.recurrence || root.parentPostId) {
        return NextResponse.json(
            { error: 'Provided id is not a recurring series root' },
            { status: 400 },
        );
    }

    await connectDB();

    // Cancel the root if it is still scheduled, then all scheduled children.
    await scheduledPostRepository.cancel(seriesId);

    const result = await ScheduledPost.updateMany(
        { parentPostId: seriesId, status: 'scheduled' },
        { $set: { status: 'cancelled' } },
    ).exec();

    return NextResponse.json({
        success: true,
        cancelledChildren: result.modifiedCount,
    });
}

export async function DELETE(request: NextRequest) {
    try {
        return await cancelSeries(request);
    } catch (error) {
        console.error('Error cancelling recurring series:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to cancel series' },
            { status: 500 },
        );
    }
}

export async function PATCH(request: NextRequest) {
    try {
        return await cancelSeries(request);
    } catch (error) {
        console.error('Error cancelling recurring series:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Failed to cancel series' },
            { status: 500 },
        );
    }
}
