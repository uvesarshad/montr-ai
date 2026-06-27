import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { bulkUpdateCompanySchema } from '@/validations/crm/company.schema';
import { crmErrorResponse } from '@/lib/crm/permissions';
import { z } from 'zod';
import { Types } from 'mongoose';

/**
 * PATCH /api/v2/crm/companies/bulk/update
 * Bulk update companies
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
    const body = await request.json();

    // Validate input
    const validatedData = bulkUpdateCompanySchema.parse(body);

    // Import company model for bulk update
    const { default: CrmCompany } = await import('@/lib/db/models/crm/company.model');
    await import('@/lib/mongodb').then(m => m.connectMongoose());

    const updateData: Record<string, unknown> = { ...validatedData.updates };
    if (validatedData.updates.tags) {
      updateData.tags = validatedData.updates.tags.map((id: string) => new Types.ObjectId(id));
    }
    if (validatedData.updates.ownerId) {
      updateData.ownerId = new Types.ObjectId(validatedData.updates.ownerId);
      updateData.assignedAt = new Date();
    }

    const result = await CrmCompany.updateMany(
      {
        _id: { $in: validatedData.ids.map((id: string) => new Types.ObjectId(id)) }
      },
      { $set: updateData }
    ).exec();

    return NextResponse.json({
      success: true,
      updatedCount: result.modifiedCount,
      message: `Successfully updated ${result.modifiedCount} company(s)`,
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
    console.error('Error bulk updating companies:', error);
    return NextResponse.json(
      { error: 'Failed to bulk update companies', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
