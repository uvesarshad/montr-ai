import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { commentRepository } from '@/lib/db/repository/crm/comment.repository';
import { serializeCommentForClient } from '@/lib/crm/comment-serialization';
import { updateCommentSchema } from '@/validations/crm/comment.schema';
import { z } from 'zod';

type SessionUser = {
  id: string;
  role?: string;
};

type CommentWithAuthorId = {
  _id: unknown;
  targetId: unknown;
  createdById: {
    toString(): string;
  };
  toObject?: () => Record<string, unknown>;
  [key: string]: unknown;
};

async function getSerializedComment(comment: CommentWithAuthorId) {
  const authorId = comment.createdById.toString();
  const [author] = await userRepository.findByIds([authorId]);

  return serializeCommentForClient(
    comment as Parameters<typeof serializeCommentForClient>[0],
    new Map(
      author
        ? [[authorId, {
            _id: authorId,
            name: author.name,
            firstName: author.firstName,
            lastName: author.lastName,
            image: author.image,
            email: author.email,
          }]]
        : []
    )
  );
}

/**
 * GET /api/v2/crm/comments/[id]
 * Get a single comment by ID
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as SessionUser).id;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    assertCrmPermission(await getCrmPermissionContext(session.user.id), 'contact', 'read');
    const comment = await commentRepository.findById(params.id);

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    return NextResponse.json(await getSerializedComment(comment as unknown as CommentWithAuthorId));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching comment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comment', details: message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v2/crm/comments/[id]
 * Update a comment (editable by owner only)
 */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as SessionUser).id;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    assertCrmPermission(await getCrmPermissionContext(session.user.id), 'contact', 'update');

    // Get existing comment
    const existingComment = await commentRepository.findById(params.id);

    if (!existingComment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Check if user is the owner
    if (existingComment.createdById.toString() !== userId) {
      return NextResponse.json(
        { error: 'Only the comment owner can edit it' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate input
    const validatedData = updateCommentSchema.parse(body);

    // Update comment
    const updatedComment = await commentRepository.update(
      params.id,
      validatedData
    );

    if (!updatedComment) {
      return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
    }

    return NextResponse.json(await getSerializedComment(updatedComment as unknown as CommentWithAuthorId));
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error updating comment:', error);
    return NextResponse.json(
      { error: 'Failed to update comment', details: message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v2/crm/comments/[id]
 * Delete a comment (soft delete, deletable by owner or admin)
 */
export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as SessionUser).id;
    const role = (session.user as SessionUser).role;
    const user = await userRepository.findById(userId);

    if (!user) {
      return NextResponse.json({ error: 'No organization found' }, { status: 403 });
    }
    assertCrmPermission(await getCrmPermissionContext(session.user.id), 'contact', 'update');

    // Get existing comment
    const existingComment = await commentRepository.findById(params.id);

    if (!existingComment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Check if user is owner or admin
    const isOwner = existingComment.createdById.toString() === userId;
    const isAdmin = role === 'admin' || role === 'super_admin';

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: 'Only the comment owner or admin can delete it' },
        { status: 403 }
      );
    }

    // Delete comment (soft delete)
    const success = await commentRepository.delete(params.id);

    if (!success) {
      return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Comment deleted successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error deleting comment:', error);
    return NextResponse.json(
      { error: 'Failed to delete comment', details: message },
      { status: 500 }
    );
  }
}
