import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { attachmentRepository } from '@/lib/db/repository/crm/attachment.repository';
import { updateAttachmentSchema } from '@/validations/crm/attachment.schema';
import { z } from 'zod';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * GET /api/v2/crm/attachments/[id]
 * Get a single attachment by ID
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
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
    const attachment = await attachmentRepository.findById(params.id);

    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    return NextResponse.json(attachment);
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching attachment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch attachment', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v2/crm/attachments/[id]
 * Update attachment metadata (description, isPublic)
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const role = session.user.role!;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    // Get existing attachment
    const existingAttachment = await attachmentRepository.findById(params.id);

    if (!existingAttachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    // Check if user is the owner or admin
    const isOwner = existingAttachment.createdById.toString() === userId;
    const isAdmin = role === 'admin' || role === 'super_admin';

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'Only the attachment owner or admin can update it' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate input
    const validatedData = updateAttachmentSchema.parse(body);

    // Update attachment metadata
    let updatedAttachment = existingAttachment;

    if (validatedData.description !== undefined) {
      updatedAttachment = (await attachmentRepository.updateDescription(
        params.id,
        validatedData.description
      )) || existingAttachment;
    }

    // Note: isPublic update would require additional repository method
    // For now, only description is updatable

    return NextResponse.json(updatedAttachment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error updating attachment:', error);
    return NextResponse.json(
      { error: 'Failed to update attachment', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/crm/attachments/[id]
 * Delete an attachment (also deletes the file from storage)
 */
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id!;
    const role = session.user.role!;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    assertCrmPermission(await getCrmPermissionContext(userId), 'contact', 'update');

    // Get existing attachment
    const existingAttachment = await attachmentRepository.findById(params.id);

    if (!existingAttachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    // Check if user is owner or admin
    const isOwner = existingAttachment.createdById.toString() === userId;
    const isAdmin = role === 'admin' || role === 'super_admin';

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'Only the attachment owner or admin can delete it' },
        { status: 403 }
      );
    }

    // Delete from database
    const deleted = await attachmentRepository.delete(params.id);

    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete attachment' }, { status: 500 });
    }

    // Delete file from storage
    try {
      const filePath = join(process.cwd(), 'public', existingAttachment.fileKey);
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
    } catch (fileError) {
      console.error('Error deleting file from storage:', fileError);
      // Don't fail the request if file deletion fails
    }

    return NextResponse.json({ success: true, message: 'Attachment deleted successfully' });
  } catch (error) {
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting attachment:', error);
    return NextResponse.json(
      { error: 'Failed to delete attachment', details: (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}
