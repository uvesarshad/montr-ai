import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { customFieldRepository } from '@/lib/db/repository/crm/custom-field.repository';
import { updateCustomFieldSchema } from '@/validations/crm/custom-field.schema';
import { ZodError } from 'zod';

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const field = await customFieldRepository.findById(params.id);
    if (!field) {
      return NextResponse.json({ error: 'Custom field not found' }, { status: 404 });
    }

    return NextResponse.json({ data: field });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching custom field:', error);
    return NextResponse.json({ error: 'Failed to fetch custom field' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const user = await userRepository.findById(userId);
    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    const ctx = await getCrmPermissionContext(userId);
    assertCanManageSettings(ctx);
    const body = await request.json();
    const validated = updateCustomFieldSchema.parse(body);

    const updated = await customFieldRepository.update(params.id, validated);
    if (!updated) {
      return NextResponse.json({ error: 'Custom field not found' }, { status: 404 });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.errors }, { status: 400 });
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error updating custom field:', error);
    return NextResponse.json({ error: 'Failed to update custom field' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    assertCanManageSettings(await getCrmPermissionContext(userId));

    const deleted = await customFieldRepository.delete(params.id);
    if (!deleted) {
      return NextResponse.json({ error: 'Custom field not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting custom field:', error);
    return NextResponse.json({ error: 'Failed to delete custom field' }, { status: 500 });
  }
}
