import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { companyRepository } from '@/lib/db/repository/crm/company.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';

/**
 * GET /api/v2/crm/companies/[id]/contacts
 * Get all contacts for a company
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;

    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'read');
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    // Check if company exists
    const company = await companyRepository.findById(params.id);
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Fetch contacts for this company
    const contacts = await contactRepository.findByCompany(params.id);

    return NextResponse.json({ data: contacts, total: contacts.length });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching company contacts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contacts', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
