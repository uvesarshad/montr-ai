import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission } from '@/lib/crm/permissions';
import { importRepository } from '@/lib/db/repository/crm/import.repository';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    // Get organization
    const user = await userRepository.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 403 });
    }
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'read');

    // Get import job
    const { id } = await params;
    const importJob = await importRepository.findById(id);

    if (!importJob) {
      return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
    }

    return NextResponse.json(importJob);
  } catch (error) {
    console.error('Get import job error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch import job' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    // Get organization
    const user = await userRepository.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 403 });
    }
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'create');

    // Delete import job
    const { id } = await params;
    const deleted = await importRepository.delete(id);

    if (!deleted) {
      return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete import job error:', error);
    return NextResponse.json(
      { error: 'Failed to delete import job' },
      { status: 500 }
    );
  }
}
