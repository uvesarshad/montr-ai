import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { bulkUpdateContactSchema } from '@/validations/crm/contact.schema';
import { getCrmPermissionContext, assertBulkCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { z } from 'zod';

/**
 * PATCH /api/v2/crm/contacts/bulk/update
 * Bulk update contacts
 */
export async function PATCH(request: NextRequest) {
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
    assertBulkCrmPermission(ctx, 'contact', 'update');

    const body = await request.json();

    // Validate input
    const validatedData = bulkUpdateContactSchema.parse(body);

    // Update contacts
    const updatedCount = await contactRepository.bulkUpdate(
      validatedData.ids,
      validatedData.updates
    );

    return NextResponse.json({
      success: true,
      updatedCount,
      message: `Successfully updated ${updatedCount} contact(s)`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error bulk updating contacts:', error);
    return NextResponse.json(
      { error: 'Failed to bulk update contacts', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
