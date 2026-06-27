import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';

import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
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

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    assertCrmPermission(await getCrmPermissionContext(), 'contact', 'read');

    const channel = await InboxChannel.findOne({
      _id: new Types.ObjectId(params.id)
    });

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    return NextResponse.json({ channel });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching inbox channel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch inbox channel' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    assertCanManageSettings(await getCrmPermissionContext());

    const body = await request.json();
    const { name, config, isActive } = body;

    const channel = await InboxChannel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(params.id)
      },
      {
        ...(name && { name }),
        ...(config && { config }),
        ...(isActive !== undefined && { isActive }),
      },
      { new: true }
    );

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    return NextResponse.json({ channel });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error updating inbox channel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update inbox channel' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    assertCanManageSettings(await getCrmPermissionContext());

    const channel = await InboxChannel.findOneAndDelete({
      _id: new Types.ObjectId(params.id)
    });

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting inbox channel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete inbox channel' },
      { status: 500 }
    );
  }
}
