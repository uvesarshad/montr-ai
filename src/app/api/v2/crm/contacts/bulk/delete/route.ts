import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { bulkDeleteContactSchema } from '@/validations/crm/contact.schema';
import { getCrmPermissionContext, assertBulkCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { z } from 'zod';

/**
 * POST /api/v2/crm/contacts/bulk/delete
 * Bulk delete contacts
 */
export async function POST(request: NextRequest) {
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
    assertBulkCrmPermission(ctx, 'contact', 'delete');

    const body = await request.json();

    // Validate input
    const validatedData = bulkDeleteContactSchema.parse(body);

    // Soft-delete contacts (move to trash)
    const deletedCount = await contactRepository.bulkSoftDelete(
      validatedData.ids,
      userId
    );

    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Moved ${deletedCount} contact(s) to trash`,
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
    console.error('Error bulk deleting contacts:', error);
    return NextResponse.json(
      { error: 'Failed to bulk delete contacts', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
