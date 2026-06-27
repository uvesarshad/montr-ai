import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { companyRepository } from '@/lib/db/repository/crm/company.repository';
import Papa from 'papaparse';

export async function POST(request: Request) {
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
    // Parse request body
    const body = await request.json();
    const { fields = [], filters = {}, selectedIds } = body;

    // Build query
    const ctx = await getCrmPermissionContext(userId);
    const { scope } = assertCrmPermission(ctx, 'company', 'export');

    const query: Record<string, unknown> = { };
    if (scope === 'own') {
      query.ownerId = userId;
    }

    // If specific IDs are selected, only export those
    if (selectedIds && Array.isArray(selectedIds) && selectedIds.length > 0) {
      query._id = { $in: selectedIds };
    } else {
      // Apply filters
      if (filters.search) {
        query.$or = [
          { name: { $regex: filters.search, $options: 'i' } },
          { domain: { $regex: filters.search, $options: 'i' } },
        ];
      }
      if (filters.type && filters.type !== 'all') {
        query.type = filters.type;
      }
      if (filters.industry && filters.industry !== 'all') {
        query.industry = filters.industry;
      }
      if (filters.size && filters.size !== 'all') {
        query.size = filters.size;
      }
      if (filters.ownerId) {
        query.ownerId = filters.ownerId;
      }
    }

    // Fetch all matching companies
    const companies = await companyRepository.findAll(query);

    // Define default fields if none specified
    const defaultFields = [
      'name',
      'domain',
      'type',
      'industry',
      'size',
      'revenue',
      'employees',
      'phone',
      'email',
      'address',
      'city',
      'state',
      'country',
      'postalCode',
      'website',
      'linkedIn',
      'twitter',
      'description',
    ];

    const exportFields = fields.length > 0 ? fields : defaultFields;

    // Map field names to CSV headers
    const fieldHeaders: Record<string, string> = {
      name: 'Company Name',
      domain: 'Domain',
      type: 'Type',
      industry: 'Industry',
      size: 'Company Size',
      revenue: 'Annual Revenue',
      employees: 'Number of Employees',
      phone: 'Phone',
      email: 'Email',
      address: 'Address',
      city: 'City',
      state: 'State',
      country: 'Country',
      postalCode: 'Postal Code',
      website: 'Website',
      linkedIn: 'LinkedIn',
      twitter: 'Twitter',
      description: 'Description',
    };

    // Convert companies to CSV rows
    const csvData = companies.map((company) => {
      const row: Record<string, unknown> = {};
      exportFields.forEach((field: string) => {
        const header = fieldHeaders[field] || field;
        let value: unknown = (company as unknown as Record<string, unknown>)[field];

        // Handle special cases
        if (field === 'tags' && Array.isArray(value)) {
          value = (value as Array<{ name?: string } | string>).map((tag) => (typeof tag === 'object' && tag !== null ? (tag as { name?: string }).name : tag) || String(tag)).join(', ');
        } else if (typeof value === 'object' && value !== null) {
          value = JSON.stringify(value);
        } else if (value === undefined || value === null) {
          value = '';
        }

        row[header] = value;
      });
      return row;
    });

    // Generate CSV
    const csv = Papa.unparse(csvData);

    // Generate filename with current date
    const today = new Date().toISOString().split('T')[0];
    const filename = `companies-export-${today}.csv`;

    // Return CSV as downloadable file
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Export companies error:', error);
    return NextResponse.json(
      { error: 'Failed to export companies' },
      { status: 500 }
    );
  }
}
