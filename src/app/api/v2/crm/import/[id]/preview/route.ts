import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission } from '@/lib/crm/permissions';
import { importRepository } from '@/lib/db/repository/crm/import.repository';
import { contactRepository } from '@/lib/db/repository/crm/contact.repository';
import { companyRepository } from '@/lib/db/repository/crm/company.repository';
import Papa from 'papaparse';
import { readFile } from 'fs/promises';
import { join } from 'path';

interface ValidationError {
  row: number;
  field: string;
  error: string;
  value?: string;
}

interface DuplicateMatch {
  row: number;
  field: string;
  value: string;
  existingId: string;
  existingName: string;
}

interface MappedRow extends Record<string, string | undefined> {
  _rowNumber?: string;
}

interface PreviewResult {
  validRows: MappedRow[];
  invalidRows: MappedRow[];
  duplicates: DuplicateMatch[];
  errors: ValidationError[];
  stats: {
    total: number;
    valid: number;
    invalid: number;
    duplicates: number;
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'read');

    // Get import job
    const { id } = await params;
    const importJob = await importRepository.findById(id);

    if (!importJob) {
      return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
    }

    // Parse request body
    const body = await request.json();
    const { fieldMapping, duplicateHandling = 'skip' } = body as { fieldMapping: Record<string, string>; duplicateHandling?: string };

    if (!fieldMapping || Object.keys(fieldMapping).length === 0) {
      return NextResponse.json(
        { error: 'Field mapping is required' },
        { status: 400 }
      );
    }

    // Read CSV file
    const filePath = join(process.cwd(), importJob.fileUrl ?? '');
    const fileContent = await readFile(filePath, 'utf-8');

    // Parse CSV
    const parseResult = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
    });

    if (parseResult.errors.length > 0) {
      return NextResponse.json(
        { error: 'Failed to parse CSV file' },
        { status: 400 }
      );
    }

    const rows = parseResult.data as Record<string, string>[];
    const validRows: MappedRow[] = [];
    const invalidRows: MappedRow[] = [];
    const errors: ValidationError[] = [];
    const duplicates: DuplicateMatch[] = [];

    // Validate each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 1;
      const mappedData: MappedRow = {};
      let hasError = false;

      // Map CSV columns to CRM fields
      for (const [csvColumn, crmField] of Object.entries(fieldMapping)) {
        if (crmField && crmField !== '__ignore__') {
          mappedData[crmField] = row[csvColumn];
        }
      }

      // Validate required fields based on entity type
      if (importJob.entityType === 'contact') {
        // Email or firstName is required for contacts
        if (!mappedData.email && !mappedData.firstName) {
          errors.push({
            row: rowNumber,
            field: 'email/firstName',
            error: 'Either email or first name is required',
          });
          hasError = true;
        }

        // Validate email format if provided
        if (mappedData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mappedData.email)) {
          errors.push({
            row: rowNumber,
            field: 'email',
            error: 'Invalid email format',
            value: mappedData.email,
          });
          hasError = true;
        }

        // Check for duplicates if not creating new
        if (
          duplicateHandling !== 'create' &&
          mappedData.email
        ) {
          const existing = await contactRepository.findOne({
            email: mappedData.email,
          });

          if (existing) {
            duplicates.push({
              row: rowNumber,
              field: 'email',
              value: mappedData.email,
              existingId: existing._id.toString(),
              existingName: `${existing.firstName || ''} ${existing.lastName || ''}`.trim(),
            });

            if (duplicateHandling === 'skip') {
              hasError = true;
            }
          }
        }
      } else if (importJob.entityType === 'company') {
        // Name is required for companies
        if (!mappedData.name) {
          errors.push({
            row: rowNumber,
            field: 'name',
            error: 'Company name is required',
          });
          hasError = true;
        }

        // Check for duplicates
        if (duplicateHandling !== 'create' && mappedData.name) {
          const existing = await companyRepository.findOne({
            name: mappedData.name,
          });

          if (existing) {
            duplicates.push({
              row: rowNumber,
              field: 'name',
              value: mappedData.name,
              existingId: existing._id.toString(),
              existingName: existing.name,
            });

            if (duplicateHandling === 'skip') {
              hasError = true;
            }
          }
        }
      }

      if (hasError) {
        invalidRows.push({ ...mappedData, _rowNumber: String(rowNumber) });
      } else {
        validRows.push({ ...mappedData, _rowNumber: String(rowNumber) });
      }
    }

    const result: PreviewResult = {
      validRows: validRows.slice(0, 100), // Limit preview to 100 rows
      invalidRows: invalidRows.slice(0, 100),
      duplicates,
      errors,
      stats: {
        total: rows.length,
        valid: validRows.length,
        invalid: invalidRows.length,
        duplicates: duplicates.length,
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Preview import error:', error);
    return NextResponse.json(
      { error: 'Failed to preview import' },
      { status: 500 }
    );
  }
}
