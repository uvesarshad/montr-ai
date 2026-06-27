import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';

import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { inboxService } from '@/lib/inbox/inbox.service';
import InboxChannel from '@/lib/db/models/inbox-channel.model';

interface SessionUser {
  id?: string;
}

async function getOrganizationId() {
  const session = await getSession();
  const userId = (session?.user as SessionUser | undefined)?.id;

  if (!userId) {
    return null;
  }

  const user = await userRepository.findById(userId);
  return user!.id?.toString() || null;
}

export async function GET() {
  try {
    assertCrmPermission(await getCrmPermissionContext(), 'contact', 'read');

    const channels = await InboxChannel.find({
}).sort({ createdAt: -1 });

    return NextResponse.json({ channels });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching inbox channels:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch inbox channels' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const userId = (session?.user as SessionUser | undefined)?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    assertCanManageSettings(await getCrmPermissionContext(userId));

    const body = await request.json();
    const { name, channelType, config } = body;

    if (!name || !channelType || !config) {
      return NextResponse.json(
        { error: 'Missing required fields: name, channelType, config' },
        { status: 400 }
      );
    }

    const channel = await inboxService.createChannel({
      name,
      channelType,
      config,
      createdById: new Types.ObjectId(userId),
    });

    return NextResponse.json({ channel }, { status: 201 });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error creating inbox channel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create inbox channel' },
      { status: 500 }
    );
  }
}
