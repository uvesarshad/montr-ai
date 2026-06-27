import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { assertBrandAccess, BrandAccessError, brandAccessErrorResponse } from '@/lib/social/brand-access';



const bodySchema = z.object({
    brandId: z.string().min(1),
    botToken: z.string().min(1),
});

/**
 * Telegram Bot Token Connection
 * Unlike other OAuth flows, Telegram uses Bot Tokens which users get from @BotFather
 *
 * POST /api/social/oauth/telegram
 * Body: { brandId: string, botToken: string }
 */
export async function POST(request: NextRequest) {
    try {
        // Auth (audit C3 — this route previously had NO auth at all).
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const parsed = bodySchema.safeParse(await request.json());
        if (!parsed.success) {
            return NextResponse.json(
                { error: 'brandId and botToken are required' },
                { status: 400 }
            );
        }

        const { brandId } = parsed.data;
        // Trim any whitespace that the user might have accidentally pasted
        const botToken = parsed.data.botToken.trim();

        // Tenancy: confirm the brand belongs to the caller (audit C4).
        try {
            ({ } = await assertBrandAccess(session.user.id, brandId));
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        // Verify bot token by calling Telegram API
        const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);

        if (!telegramResponse.ok) {
            const errorData = await telegramResponse.json();
            console.error('Telegram API error:', errorData);
            return NextResponse.json(
                { error: 'Invalid bot token. Please check with @BotFather.' },
                { status: 400 }
            );
        }

        const botData = await telegramResponse.json();
        const bot = botData.result;

        // Check if bot already connected to another brand
        const existingAccount = await socialAccountRepository.findByPlatformAccountId('telegram', bot.id.toString());
        if (existingAccount && existingAccount.brandId !== brandId) {
            return NextResponse.json(
                { error: 'This Telegram bot is already connected to another brand' },
                { status: 400 }
            );
        }

        if (existingAccount) {
            // Update existing account
            await socialAccountRepository.update(existingAccount._id.toString(), {
                accessToken: botToken, // Telegram uses the bot token as access token
            });
        } else {
            // Plan enforcement (audit B3) — only on a NEW connection. Org-less
            // personal accounts are not capped.
            // Create new account
            await socialAccountRepository.create({
                brandId,
                platform: 'telegram',
                platformAccountId: bot.id.toString(),
                platformUsername: bot.username,
                platformDisplayName: bot.first_name,
                accessToken: botToken,
                scopes: ['bot'],
            });
        }

        return NextResponse.json({
            success: true,
            bot: {
                id: bot.id,
                username: bot.username,
                name: bot.first_name,
            },
        });

    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('Telegram connection error:', msg);
        return NextResponse.json(
            { error: `Failed to connect Telegram bot: ${msg}` },
            { status: 500 }
        );
    }
}
