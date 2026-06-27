import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { getCrmPermissionContext, assertCanManageSettings, crmErrorResponse } from '@/lib/crm/permissions';
import { customFieldRepository } from '@/lib/db/repository/crm/custom-field.repository';
import { z } from 'zod';

const reorderSchema = z.object({
  entityType: z.enum(['contact', 'company', 'deal']),
  fieldOrder: z.array(z.object({ id: z.string(), order: z.number() })),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    assertCanManageSettings(await getCrmPermissionContext(userId));

    const body = await request.json();
    const { entityType, fieldOrder } = reorderSchema.parse(body);

    await customFieldRepository.reorder(entityType, fieldOrder);

    return NextResponse.json({ success: true });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error reordering custom fields:', error);
    return NextResponse.json({ error: 'Failed to reorder custom fields' }, { status: 500 });
  }
}
