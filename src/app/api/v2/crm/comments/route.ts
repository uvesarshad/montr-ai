import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
import { getCrmPermissionContext, assertCrmPermission, crmErrorResponse } from '@/lib/crm/permissions';
import { commentRepository } from '@/lib/db/repository/crm/comment.repository';
import { serializeCommentsForClient, serializeCommentForClient } from '@/lib/crm/comment-serialization';
import { createCommentSchema } from '@/validations/crm/comment.schema';
import { z } from 'zod';

type SessionUser = {
  id: string;
};

type CommentWithAuthorId = {
  createdById: {
    toString(): string;
  };
};

async function loadAuthors(commentOrComments: CommentWithAuthorId | CommentWithAuthorId[]) {
  const comments = Array.isArray(commentOrComments) ? commentOrComments : [commentOrComments];
  const authorIds = [...new Set(comments.map((comment) => comment.createdById.toString()))];
  const authors = await userRepository.findByIds(authorIds);

  return authors.map((author) => ({
    _id: author._id.toString(),
    name: author.name,
    firstName: author.firstName,
    lastName: author.lastName,
    image: author.image,
    email: author.email,
  }));
}

/**
 * GET /api/v2/crm/comments
 * List comments for a target entity with optional filters
 */
export async function GET(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);

    // Required parameters
    const targetType = searchParams.get('targetType') as 'contact' | 'company' | 'deal' | 'activity';
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

    // Check if filtering for replies
    const parentId = searchParams.get('parentId');

    let result;

    if (parentId) {
      // Get replies for a specific comment
      const replies = await commentRepository.findReplies(parentId);
      const authors = await loadAuthors(replies);
      result = {
        // @ts-expect-error
        data: serializeCommentsForClient(replies, authors),
        pagination: {
          page: 1,
          limit: replies.length,
          total: replies.length,
          totalPages: 1,
          hasMore: false,
        },
      };
    } else {
      // Get top-level comments for target
      result = await commentRepository.findByTarget(targetType, targetId, {
        page,
        limit,
      });
      const authors = await loadAuthors(result.data);
      result = {
        ...result,
        // @ts-expect-error
        data: serializeCommentsForClient(result.data, authors),
      };
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const permResp = crmErrorResponse(error);
    if (permResp) return permResp;
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments', details: message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v2/crm/comments
 * Create a new comment
 */
export async function POST(request: NextRequest) {
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
    const body = await request.json();

    // Validate input
    const validatedData = createCommentSchema.parse(body);

    // TODO: Verify user has access to target entity
    // This would require checking if the target exists and belongs to the organization

    // Create comment
    const comment = await commentRepository.create({
      ...validatedData,
      createdById: userId,
    });

    const authors = await loadAuthors(comment);
    // @ts-expect-error
    return NextResponse.json(serializeCommentForClient(comment, new Map(authors.map((author) => [author._id, author]))), { status: 201 });
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
    console.error('Error creating comment:', error);
    return NextResponse.json(
      { error: 'Failed to create comment', details: message },
      { status: 500 }
    );
  }
}
