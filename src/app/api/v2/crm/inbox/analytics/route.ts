import { NextRequest, NextResponse } from 'next/server';

import { getSession } from '@/lib/get-session';
import InboxChannel from '@/lib/db/models/inbox-channel.model';
import InboxConversation from '@/lib/db/models/inbox-conversation.model';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { buildInboxAnalytics } from '@/lib/inbox/inbox-insights';

interface SessionUser {
  id?: string;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const userId = (session?.user as SessionUser | undefined)?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await userRepository.findById(userId);
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'read');

    const { searchParams } = new URL(request.url);
    const startDate =
      searchParams.get('startDate') ||
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = searchParams.get('endDate') || new Date().toISOString();
    const [conversations, channels] = await Promise.all([
      InboxConversation.find({
        createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) },
      }),
      InboxChannel.find({ }),
    ]);

    const analytics = buildInboxAnalytics({
      conversations: conversations.map((conversation) => ({
        status: conversation.status,
        createdAt: conversation.createdAt,
        channelId: conversation.channelId,
        assignedToId: conversation.assignedToId,
        firstResponseTime: conversation.firstResponseTime,
        averageResponseTime: conversation.averageResponseTime,
        csatRating: conversation.csatRating,
      })),
      channels: channels.map((channel) => ({
        _id: channel._id,
        channelType: channel.channelType,
      })),
    });

    return NextResponse.json(analytics);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching inbox analytics:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch inbox analytics' },
      { status: 500 }
    );
  }
}
