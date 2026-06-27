import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { attachmentRepository, CreateAttachmentDto } from '@/lib/db/repository/crm/attachment.repository';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/svg+xml',
  'image/webp',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text
  'text/plain',
  'text/csv',
  'application/json',
  // Archives
  'application/zip',
  'application/x-rar-compressed',
];

/**
 * GET /api/v2/crm/attachments
 * List attachments for a target entity
 */
export async function GET(request: NextRequest) {
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
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'read');
    const { searchParams } = new URL(request.url);

    // Required parameters
    const targetType = searchParams.get('targetType');
    const targetId = searchParams.get('targetId');

    if (!targetType || !targetId) {
      return NextResponse.json(
        { error: 'targetType and targetId are required' },
        { status: 400 }
      );
    }

    // Pagination parameters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '25');

    // Get attachments
    const result = await attachmentRepository.findByTarget(
      targetType,
      targetId,
      { page, limit }
    );

    return NextResponse.json(result);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching attachments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch attachments', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v2/crm/attachments
 * Upload a new attachment
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

    const organizationId = user.id!.toString();

    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'update');

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const targetType = formData.get('targetType') as string;
    const targetId = formData.get('targetId') as string;
    const description = formData.get('description') as string | null;
    const isPublic = formData.get('isPublic') === 'true';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!targetType || !targetId) {
      return NextResponse.json(
        { error: 'targetType and targetId are required' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 413 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'File type not supported', supportedTypes: ALLOWED_MIME_TYPES },
        { status: 415 }
      );
    }

    // TODO: Verify user has access to target entity

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = file.name.split('.').pop() || 'bin';
    const fileName = file.name;
    const uniqueFileName = `${timestamp}-${randomString}.${extension}`;

    // Create upload directory
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'crm', 'attachments', organizationId);
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Save file
    const filePath = join(uploadDir, uniqueFileName);
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Generate file URL
    const fileUrl = `/uploads/crm/attachments/${organizationId}/${uniqueFileName}`;
    const fileKey = `crm/attachments/${organizationId}/${uniqueFileName}`;

    // Create attachment record
    const attachment = await attachmentRepository.create({
      targetType: targetType as CreateAttachmentDto['targetType'],
      targetId,
      fileName,
      fileKey,
      fileUrl,
      fileSize: file.size,
      mimeType: file.type,
      extension,
      description: description || undefined,
      isPublic,
      createdById: userId,
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error uploading attachment:', error);
    return NextResponse.json(
      { error: 'Failed to upload attachment', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
