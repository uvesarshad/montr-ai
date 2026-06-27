import { NextRequest, NextResponse } from 'next/server';

import InboxChannel from '@/lib/db/models/inbox-channel.model';
import InboxConversation from '@/lib/db/models/inbox-conversation.model';
import InboxMessage from '@/lib/db/models/inbox-message.model';
import { dbConnect } from '@/lib/db/connect';
import {
  buildChatbotCorsHeaders,
  isAuthorizedChatbotOrigin,
} from '@/lib/inbox/chatbot-origin';
import { CoreMessage } from 'ai';

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

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');

  try {
    const body = await req.json();
    const widgetToken = typeof body?.widgetToken === 'string' ? body.widgetToken : '';
    const visitorId: string | undefined = typeof body?.visitorId === 'string' ? body.visitorId : undefined;

    if (!widgetToken) {
      return jsonWithCors({ error: 'widgetToken is required' }, 400, origin);
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

    if (!isAuthorizedChatbotOrigin({
      websiteUrl: channel.config.websiteUrl,
      websiteUrls: channel.config.websiteUrls,
      origin,
      referer,
    })) {
      return jsonWithCors({ error: 'Unauthorized domain' }, 403, origin);
    }

    // Identified-visitor: look up existing conversation + last N messages for cross-device continuity
    let priorSessionId: string | null = null;
    let priorHistory: CoreMessage[] = [];

    if (visitorId) {
      const existing = await InboxConversation.findOne({
        channelId: channel._id,
        'metadata.visitorId': visitorId,
        status: { $in: ['open', 'pending'] },
      }).sort({ createdAt: -1 });

      if (existing) {
        priorSessionId = existing.metadata?.sessionId ?? null;

        const msgs = await InboxMessage.find({
          conversationId: existing._id,
          isNote: false,
          messageType: 'text',
        })
          .sort({ createdAt: -1 })
          .limit(20)
          .lean();

        priorHistory = msgs.reverse().map((m) => ({
          role: m.direction === 'inbound' ? 'user' : 'assistant',
          content: m.content,
        } as CoreMessage));
      }
    }

    return jsonWithCors({
      success: true,
      config: {
        greeting: channel.config.greeting || 'Hi! How can I help you today?',
        placeholder: channel.config.placeholder || 'Type your message...',
        widgetPosition: channel.config.widgetPosition || 'bottom-right',
        primaryColor: channel.config.primaryColor || '#3B82F6',
        icon: channel.config.icon || 'AI',
      },
      session: {
        priorSessionId,
        priorHistory,
      },
    }, 200, origin);
  } catch (error) {
    console.error('Error validating chatbot socket:', error);
    return jsonWithCors({ error: (error instanceof Error ? error.message : String(error)) }, 500, origin);
  }
}
