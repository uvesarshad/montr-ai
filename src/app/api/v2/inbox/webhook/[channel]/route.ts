import { NextResponse } from 'next/server';
import { adapterRegistry } from '@/lib/inbox/adapters/adapter-registry';
import InboxChannel from '@/lib/db/models/inbox-channel.model';
import { dbConnect } from '@/lib/db/connect';

/**
 * POST /api/v2/inbox/webhook/[channel]
 * Unified webhook endpoint for Telegram, Teams, Google Chat.
 *
 * Telegram: POST /api/v2/inbox/webhook/telegram?token={channelId}
 * Teams:    POST /api/v2/inbox/webhook/teams
 * GChat:    POST /api/v2/inbox/webhook/google_chat?token={channelId}
 * 
 * Each platform sends its webhook payload here.
 * The adapter converts it to a unified InboxMessage format.
 */
export async function POST(req: Request, props: { params: Promise<{ channel: string }> }) {
    const params = await props.params;
    try {
        await dbConnect();

        const channelType = params.channel;
        try {
            // Validate adapter exists; we don't need to keep the reference because
            // inboxService.receiveMessage looks it up again internally.
            adapterRegistry.getAdapter(channelType as 'whatsapp' | 'telegram' | 'discord' | 'slack' | 'facebook' | 'instagram');
        } catch {
            return new NextResponse(`Unsupported channel: ${channelType}`, { status: 400 });
        }

        // Resolve the channel record
        const url = new URL(req.url);
        const channelToken = url.searchParams.get('token');

        let channel;
        if (channelToken) {
            channel = await InboxChannel.findById(channelToken);
        } else {
            // For Teams, find by channelType + active
            channel = await InboxChannel.findOne({
                channelType,
                isActive: true,
            });
        }

        if (!channel) {
            return new NextResponse('Channel not found', { status: 404 });
        }

        // Parse webhook payload
        const payload = await req.json();

        // Process via inboxService.receiveMessage which internally uses the adapter registry
        const { inboxService } = await import('@/lib/inbox/inbox.service');

        await inboxService.receiveMessage({
            channelId: channel._id,
            payload,
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error(`[Webhook ${params.channel}] Error:`, error);
        // Return 200 to prevent webhook retries on our errors
        return NextResponse.json({ ok: false, error: (error instanceof Error ? error.message : String(error)) }, { status: 200 });
    }
}

/**
 * GET — Webhook verification (used by Telegram)
 */
export async function GET(_req: Request, props: { params: Promise<{ channel: string }> }) {
    const params = await props.params;
    // Telegram webhook verification just needs a 200
    if (params.channel === 'telegram') {
        return NextResponse.json({ ok: true });
    }

    return new NextResponse('OK', { status: 200 });
}
