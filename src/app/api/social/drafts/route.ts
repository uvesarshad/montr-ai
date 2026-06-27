import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { draftRepository } from '@/lib/db/repository/draft.repository';
import { scheduledPostRepository } from '@/lib/db/repository/scheduled-post.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { activityLogRepository } from '@/lib/db/repository/activity-log.repository';
import { buildDraftSidebarItems } from '@/lib/social/draft-sidebar';
import { assertBrandAccess, BrandAccessError, brandAccessErrorResponse } from '@/lib/social/brand-access';

const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong';

const buildDraftMatchKey = ({
    brandId,
    content,
    mediaUrls,
    platformAccountIds,
}: {
    brandId: string;
    content: string;
    mediaUrls: string[];
    platformAccountIds: string[];
}) =>
    [
        brandId,
        content.trim(),
        mediaUrls.length,
        [...platformAccountIds].sort().join(','),
        [...mediaUrls].sort().join(','),
    ].join('::');

// GET - List all drafts for the current user
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const brandId = searchParams.get('brandId');
        const limit = parseInt(searchParams.get('limit') || '50');

        let drafts;
        if (brandId) {
            // Tenancy: confirm the brand belongs to the caller (audit C4).
            try {
                await assertBrandAccess(session.user.id, brandId);
            } catch (err) {
                if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
                throw err;
            }
            drafts = await draftRepository.findByBrand(brandId, limit);
        } else {
            drafts = await draftRepository.findByUser(session.user.id!, limit);
        }

        const draftItems = drafts.map(d => ({
            id: d._id.toString(),
            brandId: d.brandId,
            title: d.title,
            content: d.content,
            mediaCount: d.media.length,
            platformCount: d.platforms.length,
            lastEditedAt: d.lastEditedAt,
            createdAt: d.createdAt,
            scheduleCount: d.scheduleCount ?? 0,
            matchKey: buildDraftMatchKey({
                brandId: d.brandId,
                content: d.content,
                mediaUrls: d.media.map((media) => media.url),
                platformAccountIds: d.platforms.map((platform) => platform.accountId),
            }),
        }));

        const activeScheduledPosts = await scheduledPostRepository.findByUser(session.user.id!, {
            brandId: brandId || undefined,
            status: ['scheduled', 'publishing'],
        });

        const items = buildDraftSidebarItems(
            draftItems.map((draft) => ({
                ...draft,
                lastEditedAt: draft.lastEditedAt.toISOString(),
                createdAt: draft.createdAt.toISOString(),
            })),
            activeScheduledPosts.map((post) => ({
                id: post._id.toString(),
                sourceDraftId: post.sourceDraftId,
                status: post.status as 'scheduled' | 'publishing',
                matchKey: buildDraftMatchKey({
                    brandId: post.brandId,
                    content: post.content,
                    mediaUrls: post.mediaUrls,
                    platformAccountIds: post.platforms.map((platform) => platform.accountId),
                }),
            })),
        );

        return NextResponse.json({
            drafts: items,
        });
    } catch (error: unknown) {
        console.error('Error fetching drafts:', error);
        return NextResponse.json(
            { error: getErrorMessage(error) || 'Failed to fetch drafts' },
            { status: 500 }
        );
    }
}

// POST - Create a new draft
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { brandId, content, title, media, platforms } = body;

        if (!brandId) {
            return NextResponse.json(
                { error: 'brandId is required' },
                { status: 400 }
            );
        }

        // Tenancy: confirm the brand belongs to the caller (audit C4).
        try {
            ({ } = await assertBrandAccess(session.user.id, brandId));
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        // Plan enforcement: per-brand draft cap (audit B3).
        const draft = await draftRepository.create({
            brandId,
            userId: session.user.id,
            title,
            content: content || '',
            media: media || [],
            platforms: platforms || [],
        });

        const user = await userRepository.findById(session.user.id!);
        if (user && user.id) {
            await activityLogRepository.log({
                brandId,
                userId: user._id.toString(),
                userName: user.name,
                action: 'draft_saved',
                targetType: 'draft',
                targetId: draft._id.toString(),
                targetName: draft.title || 'Untitled Draft',
                metadata: { type: 'create' },
            });
        }

        return NextResponse.json({
            success: true,
            draft: {
                id: draft._id,
                title: draft.title,
                lastEditedAt: draft.lastEditedAt,
            },
        });
    } catch (error: unknown) {
        console.error('Error creating draft:', error);
        return NextResponse.json(
            { error: getErrorMessage(error) || 'Failed to create draft' },
            { status: 500 }
        );
    }
}

// PATCH - Update an existing draft
export async function PATCH(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { id, content, title, media, platforms } = body;

        if (!id) {
            return NextResponse.json(
                { error: 'Draft id is required' },
                { status: 400 }
            );
        }

        const updated = await draftRepository.update(id, session.user.id!, {
            content,
            title,
            media,
            platforms,
        });

        if (!updated) {
            return NextResponse.json(
                { error: 'Draft not found or unauthorized' },
                { status: 404 }
            );
        }

        const user = await userRepository.findById(session.user.id!);
        if (user && user.id) {
            await activityLogRepository.log({
                brandId: updated.brandId,
                userId: user._id.toString(),
                userName: user.name,
                action: 'draft_saved',
                targetType: 'draft',
                targetId: updated._id.toString(),
                targetName: updated.title || 'Untitled Draft',
                metadata: { type: 'update' },
            });
        }

        return NextResponse.json({
            success: true,
            draft: {
                id: updated._id,
                title: updated.title,
                lastEditedAt: updated.lastEditedAt,
            },
        });
    } catch (error: unknown) {
        console.error('Error updating draft:', error);
        return NextResponse.json(
            { error: getErrorMessage(error) || 'Failed to update draft' },
            { status: 500 }
        );
    }
}

// DELETE - Delete a draft
export async function DELETE(request: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'Draft id is required' },
                { status: 400 }
            );
        }

        const draft = await draftRepository.findById(id);

        const deleted = await draftRepository.delete(id, session.user.id!);

        if (!deleted) {
            return NextResponse.json(
                { error: 'Draft not found or unauthorized' },
                { status: 404 }
            );
        }

        const user = await userRepository.findById(session.user.id!);
        if (user && user.id && draft) {
            await activityLogRepository.log({
                brandId: draft.brandId,
                userId: user._id.toString(),
                userName: user.name,
                action: 'draft_deleted',
                targetType: 'draft',
                targetId: id,
                targetName: draft.title || 'Untitled Draft',
            });
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('Error deleting draft:', error);
        return NextResponse.json(
            { error: getErrorMessage(error) || 'Failed to delete draft' },
            { status: 500 }
        );
    }
}
