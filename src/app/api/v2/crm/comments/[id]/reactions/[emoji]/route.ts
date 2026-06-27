import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { commentRepository } from '@/lib/db/repository/crm/comment.repository';
import { serializeCommentForClient } from '@/lib/crm/comment-serialization';

type SessionUser = {
  id: string;
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
 * DELETE /api/v2/crm/comments/[id]/reactions/[emoji]
 * Remove a reaction (emoji) from a comment
 */
export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ id: string; emoji: string }> }
) {
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

    // Check if comment exists
    const comment = await commentRepository.findById(params.id);

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Decode emoji (it comes URL encoded)
    const emoji = decodeURIComponent(params.emoji);

    // Remove reaction
    const updatedComment = await commentRepository.removeReaction(
      params.id,
      userId,
      emoji
    );

    if (!updatedComment) {
      return NextResponse.json({ error: 'Failed to remove reaction' }, { status: 500 });
    }

    return NextResponse.json(await getSerializedComment(updatedComment as unknown as CommentWithAuthorId));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error removing reaction:', error);
    return NextResponse.json(
      { error: 'Failed to remove reaction', details: message },
      { status: 500 }
    );
  }
}
