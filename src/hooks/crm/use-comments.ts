'use client';

import { useState, useEffect, useCallback } from 'react';
import { Comment } from '@/types/crm';
import { CreateCommentInput, UpdateCommentInput } from '@/validations/crm/comment.schema';
import { buildRemoveReactionPath } from '@/lib/crm/comment-serialization';

export interface CommentFilters {
  targetType: string;
  targetId: string;
  parentId?: string;
}

export interface UseCommentsResult {
  comments: Comment[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createComment: (data: CreateCommentInput) => Promise<Comment>;
  updateComment: (id: string, data: UpdateCommentInput) => Promise<Comment>;
  deleteComment: (id: string) => Promise<void>;
  addReaction: (id: string, emoji: string) => Promise<void>;
  removeReaction: (id: string, emoji: string) => Promise<void>;
}

export function useComments(filters: CommentFilters): UseCommentsResult {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Build query string from filters
      const params = new URLSearchParams();
      params.append('targetType', filters.targetType);
      params.append('targetId', filters.targetId);

      if (filters.parentId) {
        params.append('parentId', filters.parentId);
      }

      const queryString = params.toString();
      const url = `/api/v2/crm/comments?${queryString}`;

      const response = await fetch(url, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        throw new Error('Failed to fetch comments');
      }

      const data = await response.json();
      setComments(data.data || data || []);
    } catch (err) {
      console.error('Error fetching comments:', err);
      setError(err instanceof Error ? err.message : 'Failed to load comments');
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const createComment = useCallback(
    async (data: CreateCommentInput): Promise<Comment> => {
      try {
        const response = await fetch('/api/v2/crm/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create comment');
        }

        const newComment = await response.json();
        setComments((prev) => [newComment, ...prev]);
        return newComment;
      } catch (err) {
        console.error('Error creating comment:', err);
        throw err instanceof Error ? err : new Error('Failed to create comment');
      }
    },
    []
  );

  const updateComment = useCallback(
    async (id: string, data: UpdateCommentInput): Promise<Comment> => {
      try {
        const response = await fetch(`/api/v2/crm/comments/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update comment');
        }

        const updatedComment = await response.json();
        setComments((prev) =>
          prev.map((comment) => (comment._id === id ? updatedComment : comment))
        );
        return updatedComment;
      } catch (err) {
        console.error('Error updating comment:', err);
        throw err instanceof Error ? err : new Error('Failed to update comment');
      }
    },
    []
  );

  const deleteComment = useCallback(async (id: string): Promise<void> => {
    try {
      const response = await fetch(`/api/v2/crm/comments/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete comment');
      }

      setComments((prev) => prev.filter((comment) => comment._id !== id));
    } catch (err) {
      console.error('Error deleting comment:', err);
      throw err instanceof Error ? err : new Error('Failed to delete comment');
    }
  }, []);

  const addReaction = useCallback(
    async (id: string, emoji: string): Promise<void> => {
      try {
        const response = await fetch(`/api/v2/crm/comments/${id}/reactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ emoji }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to add reaction');
        }

        await fetchComments();
      } catch (err) {
        console.error('Error adding reaction:', err);
        throw err instanceof Error ? err : new Error('Failed to add reaction');
      }
    },
    [fetchComments]
  );

  const removeReaction = useCallback(
    async (id: string, emoji: string): Promise<void> => {
      try {
        const response = await fetch(buildRemoveReactionPath(id, emoji), {
          method: 'DELETE',
          credentials: 'include',
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to remove reaction');
        }

        await fetchComments();
      } catch (err) {
        console.error('Error removing reaction:', err);
        throw err instanceof Error ? err : new Error('Failed to remove reaction');
      }
    },
    [fetchComments]
  );

  return {
    comments,
    loading,
    error,
    refetch: fetchComments,
    createComment,
    updateComment,
    deleteComment,
    addReaction,
    removeReaction,
  };
}
