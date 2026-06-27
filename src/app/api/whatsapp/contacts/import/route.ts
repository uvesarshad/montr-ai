import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { csvParserService } from '@/lib/services/csv-parser.service';
import CrmContact from '@/lib/db/models/crm/contact.model';

/**
 * POST /api/whatsapp/contacts/import
 * Import contacts from CSV/Excel file
 */
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'File is required' }, { status: 400 });
        }

        // Parse file
        let parseResult;

        if (file.name.endsWith('.csv')) {
            parseResult = await csvParserService.parseCSV(file);
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            parseResult = await csvParserService.parseExcel(file);
        } else {
            return NextResponse.json(
                { error: 'Unsupported file format. Please upload CSV or Excel file.' },
                { status: 400 }
            );
        }

        // Import contacts
        let imported = 0;
        let skipped = 0;
        const importErrors: string[] = [...parseResult.errors];

        for (const contactData of parseResult.contacts) {
            try {
                // Check if contact already exists
                const existing = await CrmContact.findOne({
                    'channels.identifier': contactData.phone,
                    'channels.type': 'whatsapp',
                });

                if (existing) {
                    skipped++;
                    continue;
                }

                // Create new contact
                await CrmContact.create({
                    firstName: contactData.firstName,
                    lastName: contactData.lastName,
                    email: contactData.email,
                    company: contactData.company,
                    tags: contactData.tags,
                    channels: [
                        {
                            type: 'whatsapp',
                            identifier: contactData.phone,
                            isPrimary: true,
                            verified: false,
                        },
                    ],
                    createdById: session.user.id,
                });

                imported++;
            } catch (error) {
                importErrors.push(`Failed to import ${contactData.phone}: ${(error instanceof Error ? error.message : String(error))}`);
            }
        }

        return NextResponse.json({
            success: true,
            imported,
            skipped,
            totalRows: parseResult.totalRows,
            errors: importErrors,
        });
    } catch (error) {
        console.error('Error importing contacts:', error);
        return NextResponse.json(
            { error: 'Failed to import contacts', details: (error instanceof Error ? error.message : String(error)) },
            { status: 500 }
        );
    }
}
