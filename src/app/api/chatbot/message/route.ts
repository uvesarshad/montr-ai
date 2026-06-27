import { NextRequest, NextResponse } from 'next/server';
import { inboxService } from '@/lib/inbox/inbox.service';
import InboxChannel from '@/lib/db/models/inbox-channel.model';
import { dbConnect } from '@/lib/db/connect';
import {
    buildChatbotCorsHeaders,
    isAuthorizedChatbotOrigin,
} from '@/lib/inbox/chatbot-origin';
import { generateChatbotReply } from '@/lib/inbox/chatbot-ai-reply';
import { checkSessionRateLimit, checkBotDailyCap } from '@/lib/inbox/chatbot-rate-limiter';

function jsonWithCors(body: unknown, status: number, origin?: string | null) {
    return NextResponse.json(body, {
        status,
        headers: buildChatbotCorsHeaders(origin),
    });
}

export async function OPTIONS(req: NextRequest) {
    return new NextResponse(null, {
        status: 204,
        headers: buildChatbotCorsHeaders(req.headers.get('origin')),
    });
}

/**
 * POST /api/chatbot/message
 * Receive message from chatbot widget (HTTP fallback)
 */
export async function POST(req: NextRequest) {
    const origin = req.headers.get('origin');
    const referer = req.headers.get('referer');

    try {
        const body = await req.json();
        const { widgetToken, sessionId, content, testMode, visitorId, visitorName, visitorEmail } = body;

        if (!widgetToken || !sessionId || !content) {
            return jsonWithCors(
                { error: 'Missing required fields' },
                400,
                origin,
            );
        }

        await dbConnect();

        const channel = await InboxChannel.findOne({
            channelType: 'website',
            $or: [
                { 'config.widgetToken': widgetToken },
                { 'config.stagingWidgetToken': widgetToken },
            ],
        });

        if (!channel) {
            return jsonWithCors({ error: 'Invalid widget token' }, 404, origin);
        }

        // Rate limiting (skip in test mode)
        if (!testMode) {
            const sessionLimit = checkSessionRateLimit(sessionId);
            if (!sessionLimit.allowed) {
                return jsonWithCors(
                    { error: 'Too many messages. Please wait a moment before sending more.' },
                    429,
                    origin,
                );
            }

            const botCap = checkBotDailyCap(
                channel._id.toString(),
                channel.config.messageCap ?? 0,
            );
            if (!botCap.allowed) {
                return jsonWithCors(
                    { error: 'This bot has reached its daily message limit. Please try again tomorrow.' },
                    429,
                    origin,
                );
            }
        }

        // Skip domain check in test mode (editor preview only)
        if (!testMode) {
            if (!isAuthorizedChatbotOrigin({
                websiteUrl: channel.config.websiteUrl,
                websiteUrls: channel.config.websiteUrls,
                origin,
                referer,
            })) {
                return jsonWithCors({ error: 'Unauthorized domain' }, 403, origin);
            }
        }

        // Store inbound message (include visitorId for cross-device session lookup)
        const { conversation } = await inboxService.receiveMessage({
            channelId: channel._id,
            payload: { sessionId, content, messageType: 'text', visitorId, visitorName, visitorEmail },
        });

        // Generate AI reply
        const { text: aiReply, handoff, quickReplies } = await generateChatbotReply({
            channel,
            userMessage: content,
            conversationId: conversation._id.toString(),
        });

        // Store outbound AI message
        if (conversation) {
            await inboxService.createMessage({
                conversationId: conversation._id,
                channelId: channel._id,
                contactId: conversation.contactId,
                direction: 'outbound',
                messageType: 'text',
                content: aiReply,
                status: 'sent',
                metadata: { isAiReply: true, handoff },
            });
        }

        return jsonWithCors(
            { success: true, reply: aiReply, handoff, quickReplies, conversationId: conversation._id },
            200,
            origin,
        );
    } catch (error) {
        console.error('Error processing chatbot message:', error);
        return jsonWithCors({ error: (error instanceof Error ? error.message : String(error)) }, 500, origin);
    }
}
