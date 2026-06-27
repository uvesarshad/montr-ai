'use client';

import { useState } from 'react';
import { useSession } from '@/lib/auth-client';
import { Comment, CreateCommentInput, UpdateCommentInput } from '@/types/crm';
import { NoteViewer } from '../notes/note-viewer';
import { CommentForm } from './comment-form';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { canManageComment, getCommentAuthorName, hasUserReacted } from '@/lib/crm/comment-serialization';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, MoreHorizontal, Pencil, Trash, Smile } from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { useToast } from '@/hooks/use-toast';

interface CommentItemProps {
  comment: Comment;
  replies?: Comment[];
  onReply: (data: CreateCommentInput) => Promise<Comment>;
  onUpdate: (id: string, data: UpdateCommentInput) => Promise<Comment>;
  onDelete: (id: string) => Promise<void>;
  onAddReaction: (id: string, emoji: string) => Promise<void>;
  onRemoveReaction: (id: string, emoji: string) => Promise<void>;
  onSuccess: () => void;
  isNested?: boolean;
}

/**
 * Individual comment component with reactions and replies
 *
 * Features:
 * - Avatar and user name
 * - Comment body (rich text display)
 * - Timestamp (relative time)
 * - Edit indicator if edited
 * - Reaction buttons (emoji picker)
 * - Reaction summary
 * - Reply button
 * - Edit/Delete actions (for owner)
 * - Nested replies (indented)
 */
export function CommentItem({
  comment,
  replies = [],
  onReply,
  onUpdate,
  onDelete,
  onAddReaction,
  onRemoveReaction,
  onSuccess,
  isNested = false,
}: CommentItemProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const { toast } = useToast();
  const { data: session } = useSession();
  const currentUserId = (session?.user as { id?: string } | undefined)?.id;
  const currentUserRole = (session?.user as { role?: string } | undefined)?.role;
  const authorName = getCommentAuthorName(comment.author);
  const canManage = canManageComment(comment.createdById, currentUserId, currentUserRole);

  // Get user initials for avatar fallback
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleReply = async (data: CreateCommentInput) => {
    try {
      await onReply({
        ...data,
        parentId: comment._id,
      });
      setIsReplying(false);
      onSuccess();
      toast({
        title: 'Success',
        description: 'Reply posted successfully',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to post reply',
      });
    }
  };

  const handleUpdate = async (data: UpdateCommentInput) => {
    try {
      await onUpdate(comment._id, data);
      setIsEditing(false);
      onSuccess();
      toast({
        title: 'Success',
        description: 'Comment updated successfully',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update comment',
      });
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this comment?')) {
      return;
    }

    try {
      setIsDeleting(true);
      await onDelete(comment._id);
      onSuccess();
      toast({
        title: 'Success',
        description: 'Comment deleted successfully',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete comment',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEmojiClick = async (emojiData: EmojiClickData) => {
    try {
      const existingReaction = comment.reactions.find((r) => r.emoji === emojiData.emoji);
      const reacted = existingReaction
        ? hasUserReacted(existingReaction.userIds, currentUserId)
        : false;

      if (reacted) {
        await onRemoveReaction(comment._id, emojiData.emoji);
      } else {
        await onAddReaction(comment._id, emojiData.emoji);
      }

      setIsEmojiOpen(false);
      onSuccess();
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to add reaction',
      });
    }
  };

  const handleReactionClick = async (emoji: string) => {
    try {
      const reaction = comment.reactions.find((item) => item.emoji === emoji);
      const reacted = reaction ? hasUserReacted(reaction.userIds, currentUserId) : false;

      if (reacted) {
        await onRemoveReaction(comment._id, emoji);
      } else {
        await onAddReaction(comment._id, emoji);
      }

      onSuccess();
    } catch {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to toggle reaction',
      });
    }
  };

  if (isEditing) {
    return (
      <div className={cn('border rounded-lg p-4', isNested && 'ml-12')}>
        <CommentForm
          targetType={comment.targetType}
          targetId={comment.targetId}
          initialValue={comment.body}
          onSubmit={(data) => handleUpdate(data)}
          onCancel={() => setIsEditing(false)}
          onSuccess={() => {}}
          submitLabel="Update"
          placeholder="Edit your comment..."
        />
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', isNested && 'ml-12')}>
      <div className="border rounded-lg p-4">
        <div className="flex items-start gap-x-3">
          <Avatar className="size-10">
            <AvatarFallback>{getInitials(authorName)}</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-x-2 text-sm">
                <span className="font-medium">{authorName}</span>
                <span className="text-muted-foreground">
                  {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                </span>
                {comment.isEdited && (
                  <span className="text-xs text-muted-foreground">(edited)</span>
                )}
              </div>

              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="size-8 p-0">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setIsEditing(true)}>
                      <Pencil className="mr-2 size-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="text-destructive"
                    >
                      <Trash className="mr-2 size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div className="prose prose-sm max-w-none">
              <NoteViewer content={comment.body} />
            </div>

            {/* Reactions */}
            {comment.reactions.length > 0 && (
              <div className="flex items-center flex-wrap gap-1 mt-3">
                {comment.reactions.map((reaction) => (
                  <button
                    type="button"
                    key={reaction.emoji}
                    onClick={() => handleReactionClick(reaction.emoji)}
                    className={cn(
                      'inline-flex items-center gap-x-1 px-2 py-1 rounded-full text-xs transition-colors',
                      hasUserReacted(reaction.userIds, currentUserId)
                        ? 'bg-primary/10 text-primary hover:bg-primary/20'
                        : 'bg-muted hover:bg-muted/80'
                    )}
                  >
                    <span>{reaction.emoji}</span>
                    <span className="text-muted-foreground">{reaction.userIds.length}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-x-2 mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsReplying(!isReplying)}
                className="h-8 px-2 text-xs"
              >
                <MessageSquare className="mr-1.5 size-3.5" />
                Reply
              </Button>

              <Popover open={isEmojiOpen} onOpenChange={setIsEmojiOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                    <Smile className="mr-1.5 size-3.5" />
                    React
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0 border-0" align="start">
                  <EmojiPicker
                    onEmojiClick={handleEmojiClick}
                    searchDisabled
                    skinTonesDisabled
                    height={350}
                    width={320}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </div>

      {/* Reply Form */}
      {isReplying && (
        <div className="ml-12">
          <CommentForm
            targetType={comment.targetType}
            targetId={comment.targetId}
            onSubmit={handleReply}
            onCancel={() => setIsReplying(false)}
            onSuccess={() => {}}
            placeholder="Write a reply..."
            submitLabel="Reply"
          />
        </div>
      )}

      {/* Nested Replies */}
      {replies.length > 0 && (
        <div className="space-y-3">
          {replies.map((reply) => (
            <CommentItem
              key={reply._id}
              comment={reply}
              replies={[]}
              onReply={onReply}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onAddReaction={onAddReaction}
              onRemoveReaction={onRemoveReaction}
              onSuccess={onSuccess}
              isNested
            />
          ))}
        </div>
      )}
    </div>
  );
}
