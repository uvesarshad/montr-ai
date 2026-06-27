import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { brandRepository } from '@/lib/db/repository/brand.repository';
import SocialAccount from '@/lib/db/models/social-account.model';

/**
 * Update a social account (e.g., set Telegram chat ID)
 * PATCH /api/social/brands/[brandId]/accounts/[accountId]
 */
export async function PATCH(
    request: NextRequest,
    props: { params: Promise<{ brandId: string; accountId: string }> }
) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { brandId, accountId } = params;
        const body = await request.json();

        // Verify brand ownership
        const brand = await brandRepository.findById(brandId);
        if (!brand) {
            return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
        }

        if (brand.userId !== session.user.id! && brand.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Verify account belongs to brand
        const account = await socialAccountRepository.findById(accountId);
        if (!account || account.brandId !== brandId) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        // Update account (currently supports telegramChatId)
        const updateData: Record<string, unknown> = {};
        if (body.telegramChatId !== undefined) {
            updateData.telegramChatId = body.telegramChatId;
        }

        await SocialAccount.findByIdAndUpdate(accountId, updateData);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating social account:', error);
        return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
    }
}

/**
 * Delete a social account
 * DELETE /api/social/brands/[brandId]/accounts/[accountId]
 */
export async function DELETE(
    _request: NextRequest,
    props: { params: Promise<{ brandId: string; accountId: string }> }
) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { brandId, accountId } = params;

        // Verify brand ownership
        const brand = await brandRepository.findById(brandId);
        if (!brand) {
            return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
        }

        if (brand.userId !== session.user.id! && brand.userId !== session.user.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Delete account
        const deleted = await socialAccountRepository.delete(accountId);
        if (!deleted) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting social account:', error);
        return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
    }
}
