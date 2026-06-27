import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import {
    assertBrandAccess,
    BrandAccessError,
    brandAccessErrorResponse,
} from '@/lib/social/brand-access';
import type { DecryptedSocialAccount } from '@/lib/db/repository/social-account.repository';

/**
 * Dynamic option-loader for the social composer (Epic 1.6).
 *
 * GET /api/social/options/[platform]?accountId=xxx[&subreddit=yyy]
 *
 * Returns `{ options: Array<{ value, label }> }` of live per-platform choices
 * (Pinterest boards, Reddit subreddits/flairs, Discord/Slack channels, Telegram
 * chats, YouTube channels, Google Business locations) so the per-platform
 * settings UI can populate its selects.
 *
 * Multi-tenancy (HARD rule): the client supplies only an `accountId`. We never
 * trust a client organizationId — we load the account, then `assertBrandAccess`
 * re-derives ownership from the session user's DB record and confirms the
 * account's brand belongs to the caller (or their org) before its decrypted
 * token is ever used. 404/403 otherwise.
 *
 * Defensive by design: each platform fetch is wrapped in try/catch. On any
 * platform API error we return `{ options: [], error }` with HTTP 200 so the
 * composer degrades gracefully instead of breaking the dialog.
 */

type Option = { value: string; label: string };

/** Stable shape for graceful-degrade responses (always HTTP 200). */
function ok(options: Option[], error?: string): NextResponse {
    return NextResponse.json(error ? { options, error } : { options });
}

function errMessage(e: unknown): string {
    return e instanceof Error ? e.message : 'Unknown error';
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ platform: string }> }
) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { platform } = await params;
        const { searchParams } = new URL(request.url);
        const accountId = searchParams.get('accountId');
        const subreddit = searchParams.get('subreddit');

        if (!accountId) {
            return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
        }

        // Load the account (no tokens yet) and confirm the caller owns its brand.
        const baseAccount = await socialAccountRepository.findById(accountId);
        if (!baseAccount) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }
        try {
            await assertBrandAccess(session.user.id, baseAccount.brandId);
        } catch (err) {
            if (err instanceof BrandAccessError) return brandAccessErrorResponse(err);
            throw err;
        }

        // Telegram needs no external call and no decrypted token — serve stored
        // channels straight from the access-checked account.
        if (platform === 'telegram') {
            const channels = baseAccount.telegramChannels || [];
            return ok(
                channels.map((ch) => ({ value: ch.chatId, label: ch.title }))
            );
        }

        // Everything else needs the decrypted access token.
        const decrypted = await socialAccountRepository.findByIdWithTokens(accountId);
        if (!decrypted) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        switch (platform) {
            case 'pinterest':
                return await loadPinterestBoards(decrypted);
            case 'reddit':
                return await loadReddit(decrypted, subreddit);
            case 'discord':
                return await loadDiscordChannels(decrypted);
            case 'slack':
                return await loadSlackChannels(decrypted);
            case 'youtube':
                return await loadYouTubeChannels(decrypted);
            case 'google_business':
                return await loadGoogleBusinessLocations(decrypted);
            default:
                return ok([]);
        }
    } catch (error) {
        console.error('Error loading social options:', error);
        return NextResponse.json({ error: 'Failed to load options' }, { status: 500 });
    }
}

// ============ Platform loaders (each degrades to { options: [], error } ) ============

async function loadPinterestBoards(acc: DecryptedSocialAccount): Promise<NextResponse> {
    try {
        const res = await fetch('https://api.pinterest.com/v5/boards', {
            headers: { Authorization: `Bearer ${acc.accessToken}` },
        });
        if (!res.ok) {
            return ok([], `Pinterest API error (HTTP ${res.status})`);
        }
        const data = (await res.json()) as {
            items?: Array<{ id?: string; name?: string }>;
        };
        const options = (data.items || [])
            .filter((b) => b.id)
            .map((b) => ({ value: String(b.id), label: b.name || String(b.id) }));
        return ok(options);
    } catch (e) {
        return ok([], errMessage(e));
    }
}

async function loadReddit(
    acc: DecryptedSocialAccount,
    subreddit: string | null
): Promise<NextResponse> {
    const headers = {
        Authorization: `Bearer ${acc.accessToken}`,
        'User-Agent': 'MontrAI/1.0 (social composer)',
    };
    try {
        if (subreddit) {
            // Link flairs for a specific subreddit.
            const res = await fetch(
                `https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/api/link_flair_v2`,
                { headers }
            );
            if (!res.ok) {
                return ok([], `Reddit API error (HTTP ${res.status})`);
            }
            const data = (await res.json()) as Array<{ id?: string; text?: string }>;
            const options = (Array.isArray(data) ? data : [])
                .filter((f) => f.id)
                .map((f) => ({ value: String(f.id), label: f.text || String(f.id) }));
            return ok(options);
        }

        // Subscribed subreddits.
        const res = await fetch(
            'https://oauth.reddit.com/subreddits/mine/subscriber?limit=100',
            { headers }
        );
        if (!res.ok) {
            return ok([], `Reddit API error (HTTP ${res.status})`);
        }
        const data = (await res.json()) as {
            data?: {
                children?: Array<{
                    data?: { display_name?: string; display_name_prefixed?: string };
                }>;
            };
        };
        const options = (data.data?.children || [])
            .map((c) => c.data)
            .filter((d): d is { display_name?: string; display_name_prefixed?: string } => !!d?.display_name)
            .map((d) => ({
                value: String(d.display_name),
                label: d.display_name_prefixed || String(d.display_name),
            }));
        return ok(options);
    } catch (e) {
        return ok([], errMessage(e));
    }
}

async function loadDiscordChannels(acc: DecryptedSocialAccount): Promise<NextResponse> {
    try {
        const guildId = acc.account.discordMetadata?.guildId;
        if (!guildId) {
            return ok([], 'No Discord guild configured for this account');
        }
        const res = await fetch(
            `https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}/channels`,
            { headers: { Authorization: `Bot ${acc.accessToken}` } }
        );
        if (!res.ok) {
            return ok([], `Discord API error (HTTP ${res.status})`);
        }
        const data = (await res.json()) as Array<{ id?: string; name?: string; type?: number }>;
        const options = (Array.isArray(data) ? data : [])
            .filter((c) => c.type === 0 && c.id) // type 0 = GUILD_TEXT
            .map((c) => ({ value: String(c.id), label: c.name || String(c.id) }));
        return ok(options);
    } catch (e) {
        return ok([], errMessage(e));
    }
}

async function loadSlackChannels(acc: DecryptedSocialAccount): Promise<NextResponse> {
    try {
        const res = await fetch(
            'https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=1000',
            { headers: { Authorization: `Bearer ${acc.accessToken}` } }
        );
        if (!res.ok) {
            return ok([], `Slack API error (HTTP ${res.status})`);
        }
        const data = (await res.json()) as {
            ok?: boolean;
            error?: string;
            channels?: Array<{ id?: string; name?: string }>;
        };
        if (!data.ok) {
            return ok([], data.error || 'Slack API error');
        }
        const options = (data.channels || [])
            .filter((c) => c.id)
            .map((c) => ({ value: String(c.id), label: c.name || String(c.id) }));
        return ok(options);
    } catch (e) {
        return ok([], errMessage(e));
    }
}

async function loadYouTubeChannels(acc: DecryptedSocialAccount): Promise<NextResponse> {
    try {
        const res = await fetch(
            'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
            { headers: { Authorization: `Bearer ${acc.accessToken}` } }
        );
        if (!res.ok) {
            return ok([], `YouTube API error (HTTP ${res.status})`);
        }
        const data = (await res.json()) as {
            items?: Array<{ id?: string; snippet?: { title?: string } }>;
        };
        const options = (data.items || [])
            .filter((c) => c.id)
            .map((c) => ({ value: String(c.id), label: c.snippet?.title || String(c.id) }));
        return ok(options);
    } catch (e) {
        return ok([], errMessage(e));
    }
}

async function loadGoogleBusinessLocations(acc: DecryptedSocialAccount): Promise<NextResponse> {
    try {
        // The account's `accounts/{id}` resource name is stored as the platform
        // account id at connect time. Without it we can't address the locations
        // collection — degrade to empty.
        const accountResource = acc.account.platformAccountId;
        if (!accountResource || !accountResource.startsWith('accounts/')) {
            return ok([]);
        }
        const res = await fetch(
            `https://mybusinessbusinessinformation.googleapis.com/v1/${accountResource}/locations?readMask=name,title`,
            { headers: { Authorization: `Bearer ${acc.accessToken}` } }
        );
        if (!res.ok) {
            return ok([], `Google Business API error (HTTP ${res.status})`);
        }
        const data = (await res.json()) as {
            locations?: Array<{ name?: string; title?: string }>;
        };
        const options = (data.locations || [])
            .filter((l) => l.name)
            .map((l) => ({ value: String(l.name), label: l.title || String(l.name) }));
        return ok(options);
    } catch (e) {
        return ok([], errMessage(e));
    }
}
