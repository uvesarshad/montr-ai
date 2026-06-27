import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { dealRepository } from '@/lib/db/repository/crm/deal.repository';
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
    const { scope } = assertCrmPermission(ctx, 'deal', 'export');

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
        query.title = { $regex: filters.search, $options: 'i' };
      }
      if (filters.status && filters.status !== 'all') {
        query.status = filters.status;
      }
      if (filters.pipelineId) {
        query.pipelineId = filters.pipelineId;
      }
      if (filters.stageId) {
        query.stageId = filters.stageId;
      }
      if (filters.ownerId) {
        query.ownerId = filters.ownerId;
      }
    }

    // Fetch all matching deals
    const deals = await dealRepository.findAll(query);

    // Define default fields if none specified
    const defaultFields = [
      'title',
      'value',
      'currency',
      'status',
      'stage',
      'priority',
      'probability',
      'expectedCloseDate',
      'actualCloseDate',
      'companyName',
      'contactName',
      'ownerName',
      'source',
      'lostReason',
      'description',
    ];

    const exportFields = fields.length > 0 ? fields : defaultFields;

    // Map field names to CSV headers
    const fieldHeaders: Record<string, string> = {
      title: 'Deal Title',
      value: 'Deal Value',
      currency: 'Currency',
      status: 'Status',
      stage: 'Stage',
      priority: 'Priority',
      probability: 'Win Probability (%)',
      expectedCloseDate: 'Expected Close Date',
      actualCloseDate: 'Actual Close Date',
      companyName: 'Company',
      contactName: 'Contact',
      ownerName: 'Owner',
      source: 'Source',
      lostReason: 'Lost Reason',
      description: 'Description',
    };

    // Convert deals to CSV rows
    const csvData = deals.map((deal) => {
      const row: Record<string, unknown> = {};
      exportFields.forEach((field: string) => {
        const header = fieldHeaders[field] || field;
        let value: unknown = (deal as unknown as Record<string, unknown>)[field];

        // Handle special cases
        if (field === 'tags' && Array.isArray(value)) {
          value = (value as Array<{ name?: string } | string>).map((tag) => (typeof tag === 'object' && tag !== null ? (tag as { name?: string }).name : tag) || tag).join(', ');
        } else if (field === 'companyName' && deal.companyId) {
          const companyId = deal.companyId as unknown as { name?: string };
          value = companyId?.name || '';
        } else if (field === 'contactName' && deal.contactId) {
          const contactId = deal.contactId as unknown as { firstName?: string; lastName?: string } | undefined;
          value = contactId
            ? `${contactId.firstName || ''} ${contactId.lastName || ''}`.trim()
            : '';
        } else if (field === 'ownerName' && deal.ownerId) {
          const ownerId = deal.ownerId as unknown as { name?: string };
          value = ownerId?.name || '';
        } else if (field === 'stage' && deal.stageId) {
          const stageId = deal.stageId as unknown as { name?: string };
          value = stageId?.name || '';
        } else if (
          (field === 'expectedCloseDate' || field === 'actualCloseDate') &&
          value
        ) {
          value = new Date(value as string | number | Date).toISOString().split('T')[0];
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
    const filename = `deals-export-${today}.csv`;

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
    console.error('Export deals error:', error);
    return NextResponse.json(
      { error: 'Failed to export deals' },
      { status: 500 }
    );
  }
}
