import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';

/**
 * Export contacts to CSV/Excel
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id!;

  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'xlsx';
    const accountId = searchParams.get('accountId');

    // Build filter
    const filter: Record<string, unknown> = { };
    if (accountId) {
      filter.accountId = accountId;
    }

    // Fetch all contacts
    const contacts = await contactRepository.findAll(filter);

    if (contacts.length === 0) {
      return NextResponse.json(
        { error: 'No contacts to export' },
        { status: 400 }
      );
    }

    // Generate CSV
    if (format === 'csv') {
      const headers = [
        'firstName',
        'lastName',
        'email',
        'phone',
        'company',
        'tags',
        'createdAt',
      ];

      const rows = contacts.map((contact) => [
        contact.firstName || '',
        contact.lastName || '',
        contact.email || '',
        contact.phone || '',
        // @ts-expect-error
        contact.company || '',
        contact.tags?.join(',') || '',
        contact.createdAt?.toISOString() || '',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map((row) => row.join(',')),
      ].join('\n');

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="contacts-export-${new Date().toISOString().split('T')[0]
            }.csv"`,
        },
      });
    }

    // Generate Excel (simplified - in production use a library like xlsx)
    // For now, return CSV with xlsx extension
    const headers = [
      'firstName',
      'lastName',
      'email',
      'phone',
      'company',
      'tags',
      'createdAt',
    ];

    const rows = contacts.map((contact) => [
      contact.firstName || '',
      contact.lastName || '',
      contact.email || '',
      contact.phone || '',
      // @ts-expect-error
      contact.company || '',
      contact.tags?.join(',') || '',
      contact.createdAt?.toISOString() || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="contacts-export-${new Date().toISOString().split('T')[0]
          }.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Error exporting contacts:', error);
    return NextResponse.json(
      { error: 'Failed to export contacts', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
