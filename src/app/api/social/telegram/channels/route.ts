import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { assertBrandAccess, BrandAccessError, brandAccessErrorResponse } from '@/lib/social/brand-access';

/**
 * Telegram Channel Management API
 * Validates channels via Telegram API and stores them for the bot account
 */

interface TelegramChat {
    id: number;
    title: string;
    type: 'channel' | 'group' | 'supergroup' | 'private';
    username?: string;
}

/**
 * Resolve the social account by client-supplied id and confirm the caller owns
 * its brand (audit C3/C4 — these routes previously had NO auth). Returns the
 * account on success, or a NextResponse to return directly on failure.
 */
async function authorizeAccount(
    userId: string,
    accountId: string
): Promise<{ ok: true; brandId: string } | { ok: false; response: NextResponse }> {
    const account = await socialAccountRepository.findById(accountId);
    if (!account) {
        return { ok: false, response: NextResponse.json({ error: 'Account not found' }, { status: 404 }) };
    }
    try {
        await assertBrandAccess(userId, account.brandId);
    } catch (err) {
        if (err instanceof BrandAccessError) return { ok: false, response: brandAccessErrorResponse(err) };
        throw err;
    }
    return { ok: true, brandId: account.brandId };
}

/**
 * GET /api/social/telegram/channels?accountId=xxx
 * Get all channels for a Telegram bot account
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const accountId = searchParams.get('accountId');

        if (!accountId) {
            return NextResponse.json(
                { error: 'accountId is required' },
                { status: 400 }
            );
        }

        const authz = await authorizeAccount(session.user.id, accountId);
        if (!authz.ok) return authz.response;

        const channels = await socialAccountRepository.getTelegramChannels(accountId);
        return NextResponse.json({ channels });

    } catch (error) {
        console.error('Error fetching Telegram channels:', error);
        return NextResponse.json(
            { error: 'Failed to fetch channels' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/social/telegram/channels
 * Add a channel/group to a Telegram bot account
 * Body: { accountId: string, chatId: string }
 * 
 * The chatId can be:
 * - A channel username like @channelname
 * - A numeric chat ID like -1001234567890
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { accountId, chatId } = body;

        if (!accountId || !chatId) {
            return NextResponse.json(
                { error: 'accountId and chatId are required' },
                { status: 400 }
            );
        }

        const authz = await authorizeAccount(session.user.id, accountId);
        if (!authz.ok) return authz.response;

        // Get the bot token for this account
        const accountData = await socialAccountRepository.findByIdWithTokens(accountId);
        if (!accountData) {
            return NextResponse.json(
                { error: 'Account not found' },
                { status: 404 }
            );
        }

        if (accountData.account.platform !== 'telegram') {
            return NextResponse.json(
                { error: 'Not a Telegram account' },
                { status: 400 }
            );
        }

        const botToken = accountData.accessToken;

        // Validate the chat via Telegram API
        const chatResponse = await fetch(
            `https://api.telegram.org/bot${botToken}/getChat?chat_id=${encodeURIComponent(chatId)}`
        );

        const chatData = await chatResponse.json();

        if (!chatData.ok) {
            return NextResponse.json(
                {
                    error: 'Invalid chat ID or bot is not a member',
                    details: chatData.description
                },
                { status: 400 }
            );
        }

        const chat: TelegramChat = chatData.result;

        // Verify bot can post (check admin status for channels)
        if (chat.type === 'channel') {
            const adminResponse = await fetch(
                `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${accountData.account.platformAccountId}`
            );
            const adminData = await adminResponse.json();

            if (!adminData.ok || !['administrator', 'creator'].includes(adminData.result?.status)) {
                return NextResponse.json(
                    { error: 'Bot must be an admin in the channel to post' },
                    { status: 400 }
                );
            }
        }

        // Determine channel type
        let channelType: 'channel' | 'group' | 'supergroup' = 'group';
        if (chat.type === 'channel') channelType = 'channel';
        else if (chat.type === 'supergroup') channelType = 'supergroup';

        // Add channel to account
        const updatedAccount = await socialAccountRepository.addTelegramChannel(accountId, {
            chatId: String(chat.id),
            title: chat.title,
            type: channelType,
            username: chat.username,
        });

        if (!updatedAccount) {
            return NextResponse.json(
                { error: 'Failed to add channel' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            channel: {
                chatId: String(chat.id),
                title: chat.title,
                type: channelType,
                username: chat.username,
            },
            // Also return the full channels list for debugging
            allChannels: updatedAccount.telegramChannels,
        });

    } catch (error) {
        console.error('Error adding Telegram channel:', error);
        return NextResponse.json(
            { error: 'Failed to add channel' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/social/telegram/channels
 * Remove a channel from a Telegram bot account
 * Body: { accountId: string, chatId: string }
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { accountId, chatId } = body;

        if (!accountId || !chatId) {
            return NextResponse.json(
                { error: 'accountId and chatId are required' },
                { status: 400 }
            );
        }

        const authz = await authorizeAccount(session.user.id, accountId);
        if (!authz.ok) return authz.response;

        const updatedAccount = await socialAccountRepository.removeTelegramChannel(accountId, chatId);

        if (!updatedAccount) {
            return NextResponse.json(
                { error: 'Account not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Error removing Telegram channel:', error);
        return NextResponse.json(
            { error: 'Failed to remove channel' },
            { status: 500 }
        );
    }
}
