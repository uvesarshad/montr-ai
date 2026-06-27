export interface CommentAuthorRecord {
  _id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  image?: string | null;
  email?: string;
}

export interface SerializedCommentReaction {
  emoji: string;
  userIds: string[];
}

interface CommentReactionLike {
  emoji: string;
  userIds?: unknown[];
}

interface SerializableComment {
  _id: unknown;
  targetId: unknown;
  parentId?: unknown;
  mentions?: unknown[];
  createdById: unknown;
  reactions?: CommentReactionLike[];
  toObject?: () => SerializableComment;
  [key: string]: unknown;
}

export function getCommentAuthorName(author?: Partial<CommentAuthorRecord>) {
  if (author?.name?.trim()) {
    return author.name.trim();
  }

  const fullName = [author?.firstName, author?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (fullName) {
    return fullName;
  }

  if (author?.email?.trim()) {
    return author.email.trim();
  }

  return 'Unknown User';
}

function toId(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    return value.toString();
  }

  return String(value);
}

export function serializeCommentForClient(
  comment: SerializableComment,
  authorsById: Map<string, CommentAuthorRecord> = new Map()
) {
  const raw = typeof comment?.toObject === 'function' ? comment.toObject() : comment;
  const createdById = toId(raw.createdById) ?? '';
  const author = authorsById.get(createdById);

  return {
    ...raw,
    _id: toId(raw._id) ?? '',
    targetId: toId(raw.targetId) ?? '',
    parentId: toId(raw.parentId),
    mentions: Array.isArray(raw.mentions) ? raw.mentions.map((mention: unknown) => toId(mention) ?? '') : [],
    createdById,
    reactions: Array.isArray(raw.reactions)
      ? raw.reactions.map((reaction): SerializedCommentReaction => ({
          emoji: reaction.emoji,
          userIds: Array.isArray(reaction.userIds)
            ? reaction.userIds.map((userId: unknown) => toId(userId) ?? '')
            : [],
        }))
      : [],
    author: author
      ? {
          id: author._id,
          name: getCommentAuthorName(author),
          image: author.image ?? undefined,
        }
      : undefined,
  };
}

export function serializeCommentsForClient(
  comments: SerializableComment[],
  authors: CommentAuthorRecord[] = []
) {
  const authorsById = new Map(authors.map((author) => [author._id, author]));
  return comments.map((comment) => serializeCommentForClient(comment, authorsById));
}

export function canManageComment(
  createdById: string,
  currentUserId?: string | null,
  role?: string | null
) {
  if (!currentUserId) {
    return false;
  }

  return createdById === currentUserId || role === 'admin' || role === 'super_admin';
}

export function hasUserReacted(
  userIds: string[],
  currentUserId?: string | null
) {
  if (!currentUserId) {
    return false;
  }

  return userIds.includes(currentUserId);
}

export function buildRemoveReactionPath(commentId: string, emoji: string) {
  return `/api/v2/crm/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`;
}
