import { NextRequest, NextResponse } from 'next/server';
import { inboxService } from '@/lib/inbox/inbox.service';
import InboxChannel from '@/lib/db/models/inbox-channel.model';
import { verifyWhatsAppSignature, parseWebhookBody } from '@/lib/whatsapp/webhook-verify';
import { resumePausedExecutionsForChannelMessage } from '@/lib/workflow/resume-channel';
import { Types } from 'mongoose';

/**
 * GET /api/webhooks/whatsapp/[channelId]
 * WhatsApp webhook verification (Meta requirement)
 */
export async function GET(req: NextRequest, props: { params: Promise<{ channelId: string }> }) {
    const params = await props.params;
    try {
        const { searchParams } = new URL(req.url);
        const mode = searchParams.get('hub.mode');
        const token = searchParams.get('hub.verify_token');
        const challenge = searchParams.get('hub.challenge');

        // Get channel to verify token
        const channel = await InboxChannel.findById(new Types.ObjectId(params.channelId));

        if (!channel) {
            return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
        }

        const verifyToken = channel.config.webhookVerifyToken;
        if (!verifyToken) {
            console.error('WhatsApp webhook verify token not configured for channel:', params.channelId);
            return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
        }

        if (mode === 'subscribe' && token === verifyToken) {
            console.log('WhatsApp webhook verified for channel:', params.channelId);
            return new NextResponse(challenge, { status: 200 });
        }

        return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
    } catch (error) {
        console.error('Error verifying WhatsApp webhook:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}

/**
 * POST /api/webhooks/whatsapp/[channelId]
 * Receive WhatsApp messages
 */
export async function POST(req: NextRequest, props: { params: Promise<{ channelId: string }> }) {
    const params = await props.params;
    try {
        // Verify Meta's X-Hub-Signature-256 against the raw body before trusting any payload.
        const rawBody = await req.text();
        const signature = req.headers.get('x-hub-signature-256');
        if (!verifyWhatsAppSignature(rawBody, signature)) {
            console.warn('WhatsApp webhook signature verification failed for channel:', params.channelId);
            return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
        }

        const payload = parseWebhookBody(rawBody);

        // Process message via inbox service
        const result = await inboxService.receiveMessage({
            channelId: new Types.ObjectId(params.channelId),
            payload,
        });

        console.log('WhatsApp message received:', {
            conversationId: result.conversation._id,
            messageId: result.message._id,
        });

        // H22 (2.25): resume any workflow paused on wait_for_channel_response for
        // this contact + whatsapp channel. The primary /api/webhooks/whatsapp route
        // already does this; the inbox-provisioned [channelId] route silently skipped
        // it, so wait-for-reply nodes never fired for those channels. Non-blocking,
        // error-logged. Only inbound messages with a real contactId can match.
        const resumeContactId = result.conversation.contactId
            ? String(result.conversation.contactId)
            : null;
        if (resumeContactId && (result.message.direction || 'inbound') === 'inbound') {
            void resumePausedExecutionsForChannelMessage({
                channel: 'whatsapp',
                contactId: resumeContactId,
                message: {
                    messageId: String(result.message.externalMessageId ?? result.message._id ?? ''),
                    content: result.message.content ?? '',
                    direction: 'inbound',
                },
            }).catch((err) => console.error('[whatsapp-webhook:channelId] channel-resume failed:', err));
        }

        // TODO: Emit WebSocket event for real-time UI update
        // TODO: Trigger AI auto-reply if enabled

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error processing WhatsApp webhook:', error);
        // Return 200 to Meta to avoid retries
        return NextResponse.json({ success: false, error: (error instanceof Error ? error.message : String(error)) }, { status: 200 });
    }
}
