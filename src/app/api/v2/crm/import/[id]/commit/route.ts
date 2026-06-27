import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission } from '@/lib/crm/permissions';
import { importRepository } from '@/lib/db/repository/crm/import.repository';
import { contactRepository, type CreateContactDto, type UpdateContactDto } from '@/lib/db/repository/crm/contact.repository';
import { companyRepository, type CreateCompanyDto, type UpdateCompanyDto } from '@/lib/db/repository/crm/company.repository';
import { findDuplicatesForCandidate } from '@/lib/crm/dedupe';
import Papa from 'papaparse';
import { readFile } from 'fs/promises';
import { join } from 'path';

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
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'create');

    // Get import job
    const { id } = await params;
    const importJob = await importRepository.findById(id);

    if (!importJob) {
      return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
    }

    if (importJob.status !== 'pending') {
      return NextResponse.json(
        { error: 'Import job is not in pending state' },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { fieldMapping, duplicateHandling = 'skip', duplicateField, defaultOwnerId, defaultTags = [] } = body as {
      fieldMapping: Record<string, string>;
      duplicateHandling?: string;
      duplicateField?: string;
      defaultOwnerId?: string;
      defaultTags?: string[];
    };

    if (!fieldMapping || Object.keys(fieldMapping).length === 0) {
      return NextResponse.json(
        { error: 'Field mapping is required' },
        { status: 400 }
      );
    }

    // Update import job with mapping and settings
    await importRepository.updateStatus(id, 'processing');

    // Read CSV file
    const filePath = join(process.cwd(), importJob.fileUrl ?? '');
    const fileContent = await readFile(filePath, 'utf-8');

    // Parse CSV
    const parseResult = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
    });

    const rows = parseResult.data as Record<string, string>[];
    let successCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;

    // Process rows in batches
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);

      for (let j = 0; j < batch.length; j++) {
        const row = batch[j];
        const rowNumber = i + j + 1;

        try {
          // Map CSV columns to CRM fields
          const mappedData: Record<string, unknown> = {
};

          for (const [csvColumn, crmField] of Object.entries(fieldMapping)) {
            if (crmField && crmField !== '__ignore__') {
              const value = row[csvColumn];
              if (value !== undefined && value !== null && value !== '') {
                mappedData[crmField] = value;
              }
            }
          }

          // Add default owner if specified
          if (defaultOwnerId) {
            mappedData.ownerId = defaultOwnerId;
          }

          // Add default tags if specified
          if (defaultTags.length > 0) {
            mappedData.tagIds = defaultTags;
          }

          if (importJob.entityType === 'contact') {
            // Check for duplicates.
            // DEDUPE(2.3): when the legacy `duplicateField` isn't configured,
            // fall back to declarative dedupe rules; otherwise keep the legacy
            // exact-email match. Either way the import's skip/update/create
            // behavior (`duplicateHandling`) is applied unchanged.
            let existing = null;
            if (duplicateHandling !== 'create') {
              if (!duplicateField) {
                const matches = await findDuplicatesForCandidate(
                  'contact',
                  mappedData,
                );
                const firstId = matches[0]?.records[0]?._id;
                if (firstId) {
                  existing = await contactRepository.findById(String(firstId));
                }
              } else if (mappedData[duplicateField]) {
                existing = await contactRepository.findOne({
                  [duplicateField]: String(mappedData[duplicateField]),
                });
              } else if (mappedData.email) {
                existing = await contactRepository.findOne({
                  email: String(mappedData.email),
                });
              }
            }

            if (existing) {
              duplicateCount++;

              if (duplicateHandling === 'update') {
                // Update existing contact
                await contactRepository.update(
                  existing._id.toString(),
                  mappedData as unknown as UpdateContactDto
                );
                successCount++;
              }
              // Skip if duplicateHandling is 'skip'
            } else {
              // Create new contact
              await contactRepository.create({
                ...mappedData,
                status: mappedData.status || 'active',
                createdById: userId,
              } as CreateContactDto);
              successCount++;
            }
          } else if (importJob.entityType === 'company') {
            // Check for duplicates. DEDUPE(2.3): same fallback as contacts.
            let existing = null;
            if (duplicateHandling !== 'create') {
              if (!duplicateField) {
                const matches = await findDuplicatesForCandidate(
                  'company',
                  mappedData,
                );
                const firstId = matches[0]?.records[0]?._id;
                if (firstId) {
                  existing = await companyRepository.findById(String(firstId));
                }
              } else if (mappedData[duplicateField]) {
                existing = await companyRepository.findOne({
                  [duplicateField]: String(mappedData[duplicateField]),
                });
              } else if (mappedData.name) {
                existing = await companyRepository.findOne({
                  name: String(mappedData.name),
                });
              }
            }

            if (existing) {
              duplicateCount++;

              if (duplicateHandling === 'update') {
                // Update existing company
                await companyRepository.update(
                  existing._id.toString(),
                  mappedData as unknown as UpdateCompanyDto
                );
                successCount++;
              }
              // Skip if duplicateHandling is 'skip'
            } else {
              // Create new company
              await companyRepository.create({
                ...mappedData,
                createdById: userId,
              } as CreateCompanyDto);
              successCount++;
            }
          }
        } catch (error) {
          errorCount++;
          await importRepository.addError(id, {
            row: rowNumber,
            error: (error instanceof Error ? error.message : String(error)) || 'Unknown error',
            data: row,
          });
        }
      }

      // Update progress
      await importRepository.updateProgress(id, {
        processedRows: i + batch.length,
        successCount,
        errorCount,
        duplicateCount,
      });
    }

    // Mark import as completed
    await importRepository.updateStatus(id, 'completed');

    return NextResponse.json({
      importId: id,
      status: 'completed',
      stats: {
        total: rows.length,
        success: successCount,
        errors: errorCount,
        duplicates: duplicateCount,
      },
    });
  } catch (error) {
    console.error('Commit import error:', error);

    // Mark import as failed
    const { id } = await params;
    const session = await getSession();
    const userId = session?.user?.id;
    return NextResponse.json(
      { error: 'Failed to import data' },
      { status: 500 }
    );
  }
}
