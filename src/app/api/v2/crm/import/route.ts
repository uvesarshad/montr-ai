import { getSession } from '@/lib/get-session';
import { NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission } from '@/lib/crm/permissions';
import { importRepository } from '@/lib/db/repository/crm/import.repository';
import Papa from 'papaparse';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

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
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'create');

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const entityType = formData.get('entityType') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!entityType || !['contact', 'company'].includes(entityType)) {
      return NextResponse.json({ error: 'Invalid entity type' }, { status: 400 });
    }

    // Check file type
    if (!file.name.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Only CSV files are supported' },
        { status: 400 }
      );
    }

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size must be less than 10MB' },
        { status: 400 }
      );
    }

    // Read file content
    const fileContent = await file.text();

    // Parse CSV to get headers and preview
    const parseResult = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      preview: 5, // Only parse first 5 rows for preview
    });

    if (parseResult.errors.length > 0) {
      return NextResponse.json(
        { error: 'Failed to parse CSV file', details: parseResult.errors },
        { status: 400 }
      );
    }

    const headers = parseResult.meta.fields || [];
    const preview = parseResult.data;

    // Count total rows
    const fullParse = Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
    });
    const totalRows = fullParse.data.length;

    if (totalRows === 0) {
      return NextResponse.json(
        { error: 'CSV file is empty' },
        { status: 400 }
      );
    }

    // Save file to uploads directory
    const uploadsDir = join(process.cwd(), 'uploads', 'imports');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const fileName = `${Date.now()}-${file.name}`;
    const filePath = join(uploadsDir, fileName);
    const fileUrl = `/uploads/imports/${fileName}`;

    // Write file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Create import job
    const importJob = await importRepository.create({
      entityType: entityType as 'contact' | 'company',
      fileName: file.name,
      fileUrl,
      fileSize: file.size,
      fieldMapping: {},
      totalRows,
      createdById: userId,
    });

    return NextResponse.json({
      importId: importJob._id.toString(),
      headers,
      preview,
      totalRows,
      fileName: file.name,
      fileSize: file.size,
    });
  } catch (error) {
    console.error('Upload import file error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}

// GET - List all imports for the organization
export async function GET(request: Request) {
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

    // Get query params
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '25');

    // Fetch imports
    const result = await importRepository.find({ page, limit });

    return NextResponse.json(result);
  } catch (error) {
    console.error('List imports error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch imports' },
      { status: 500 }
    );
  }
}
