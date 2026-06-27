import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission } from '@/lib/crm/permissions';
import { importRepository } from '@/lib/db/repository/crm/import.repository';

export async function POST(
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

    // Cancel import job
    const { id } = await params;
    const importJob = await importRepository.cancel(id);

    if (!importJob) {
      return NextResponse.json(
        { error: 'Import job not found or cannot be cancelled' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      importId: id,
      status: 'cancelled',
    });
  } catch (error) {
    console.error('Cancel import error:', error);
    return NextResponse.json(
      { error: 'Failed to cancel import' },
      { status: 500 }
    );
  }
}
