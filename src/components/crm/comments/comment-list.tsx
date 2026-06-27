'use client';

import { useComments } from '@/hooks/crm/use-comments';
import { Comment } from '@/types/crm';
import { CommentItem } from './comment-item';
import { CommentForm } from './comment-form';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare } from 'lucide-react';

interface CommentListProps {
  targetType: 'contact' | 'company' | 'deal' | 'activity';
  targetId: string;
  showForm?: boolean;
}

/**
 * Comment list component with threading support
 *
 * Features:
 * - Display all comments for a target entity
 * - Show comment threads (parent-child relationship)
 * - Load more pagination
 * - Empty state when no comments
 * - Loading state with skeletons
 */
export function CommentList({ targetType, targetId, showForm = true }: CommentListProps) {
  const {
    comments,
    loading,
    error,
    refetch,
    createComment,
    updateComment,
    deleteComment,
    addReaction,
    removeReaction,
  } = useComments({ targetType, targetId });

  // Filter to show only top-level comments (no parent)
  const topLevelComments = comments.filter((comment) => !comment.parentId);

  // Helper function to get replies for a comment
  const getReplies = (commentId: string): Comment[] => {
    return comments.filter((comment) => comment.parentId === commentId);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {showForm && (
          <div className="border rounded-lg p-4">
            <Skeleton className="h-32 w-full" />
          </div>
        )}
        {(['a', 'b', 'c'] as const).map((k) => (
          <div key={k} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-x-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        <p>Failed to load comments: {error}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-2 text-sm text-primary hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showForm && (
        <CommentForm
          targetType={targetType}
          targetId={targetId}
          onSubmit={createComment}
          onSuccess={refetch}
          placeholder="Write a comment..."
        />
      )}

      {topLevelComments.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="size-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">No comments yet</p>
          <p className="text-xs mt-1">Be the first to comment</p>
        </div>
      ) : (
        <div className="space-y-4">
          {topLevelComments.map((comment) => (
            <CommentItem
              key={comment._id}
              comment={comment}
              replies={getReplies(comment._id)}
              onReply={createComment}
              onUpdate={updateComment}
              onDelete={deleteComment}
              onAddReaction={addReaction}
              onRemoveReaction={removeReaction}
              onSuccess={refetch}
            />
          ))}
        </div>
      )}
    </div>
  );
}
