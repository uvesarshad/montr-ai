import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { commentRepository } from '@/lib/db/repository/crm/comment.repository';
import { serializeCommentForClient } from '@/lib/crm/comment-serialization';
import { addReactionSchema } from '@/validations/crm/comment.schema';
import { z } from 'zod';

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
 * POST /api/v2/crm/comments/[id]/reactions
 * Add a reaction (emoji) to a comment
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
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

    const body = await request.json();

    // Validate input
    const { emoji } = addReactionSchema.parse(body);

    // Add reaction
    const updatedComment = await commentRepository.addReaction(
      params.id,
      userId,
      emoji
    );

    if (!updatedComment) {
      return NextResponse.json({ error: 'Failed to add reaction' }, { status: 500 });
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
    console.error('Error adding reaction:', error);
    return NextResponse.json(
      { error: 'Failed to add reaction', details: message },
      { status: 500 }
    );
  }
}
