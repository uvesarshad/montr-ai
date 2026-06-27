import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { companyRepository } from '@/lib/db/repository/crm/company.repository';
import { bulkDeleteCompanySchema } from '@/validations/crm/company.schema';
import { crmErrorResponse } from '@/lib/crm/permissions';
import { z } from 'zod';

/**
 * POST /api/v2/crm/companies/bulk/delete
 * Bulk delete companies
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
    const body = await request.json();

    // Validate input
    const validatedData = bulkDeleteCompanySchema.parse(body);

    // Soft-delete companies (move to trash)
    const deletedCount = await companyRepository.bulkSoftDelete(
      validatedData.ids,
      userId
    );

    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Moved ${deletedCount} company(s) to trash`,
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
    console.error('Error bulk deleting companies:', error);
    return NextResponse.json(
      { error: 'Failed to bulk delete companies', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
