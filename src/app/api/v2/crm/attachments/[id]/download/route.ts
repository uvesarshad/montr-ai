import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { attachmentRepository } from '@/lib/db/repository/crm/attachment.repository';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * GET /api/v2/crm/attachments/[id]/download
 * Download an attachment file
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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

    // Get attachment
    const attachment = await attachmentRepository.findById(params.id);

    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    // TODO: Verify user has access to target entity

    // Check if attachment is infected
    if (attachment.scanStatus === 'infected') {
      return NextResponse.json(
        { error: 'This file has been flagged as infected and cannot be downloaded' },
        { status: 403 }
      );
    }

    // Get file path
    const filePath = join(process.cwd(), 'public', attachment.fileKey);

    // Check if file exists
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found on server' }, { status: 404 });
    }

    // Read file
    const fileBuffer = await readFile(filePath);

    // Determine if file should be downloaded or displayed inline
    const { searchParams } = new URL(request.url);
    const inline = searchParams.get('inline') === 'true';

    // Create response with file
    const response = new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Length': attachment.fileSize.toString(),
        'Content-Disposition': inline
          ? `inline; filename="${attachment.fileName}"`
          : `attachment; filename="${attachment.fileName}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });

    return response;
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error downloading attachment:', error);
    return NextResponse.json(
      { error: 'Failed to download attachment', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
