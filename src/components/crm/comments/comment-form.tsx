'use client';

import { useState } from 'react';
import { CreateCommentInput } from '@/types/crm';
import { RichTextEditor } from '../notes/rich-text-editor';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

function extractMentionIds(json: string): string[] {
  try {
    const doc = JSON.parse(json);
    const ids: string[] = [];
    interface ProseMirrorNode { type?: string; attrs?: { id?: string | number }; content?: ProseMirrorNode[] }
    function walk(node: ProseMirrorNode | null | undefined) {
      if (!node) return;
      if (node.type === 'mention' && node.attrs?.id) {
        ids.push(String(node.attrs.id));
      }
      if (Array.isArray(node.content)) node.content.forEach(walk);
    }
    walk(doc);
    return [...new Set(ids)];
  } catch {
    return [];
  }
}

interface CommentFormProps {
  targetType: 'contact' | 'company' | 'deal' | 'activity';
  targetId: string;
  initialValue?: string;
  onSubmit: (data: CreateCommentInput) => Promise<unknown>;
  onCancel?: () => void;
  onSuccess: () => void;
  placeholder?: string;
  submitLabel?: string;
}

export function CommentForm({
  targetType,
  targetId,
  initialValue,
  onSubmit,
  onCancel,
  onSuccess,
  placeholder = 'Write a comment...',
  submitLabel = 'Comment',
}: CommentFormProps) {
  const [body, setBody] = useState(initialValue || '');
  const [bodyPlain, setBodyPlain] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEditorChange = (json: string, text: string) => {
    setBody(json);
    setBodyPlain(text);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!bodyPlain.trim()) {
      return;
    }

    try {
      setIsSubmitting(true);

      // Extract user IDs from TipTap mention nodes in the JSON content
      const mentions = extractMentionIds(body);

      await onSubmit({
        targetType,
        targetId,
        body,
        bodyPlain,
        mentions,
      });

      // Reset form
      setBody('');
      setBodyPlain('');
      onSuccess();
    } catch (error) {
      console.error('Error submitting comment:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    setBody('');
    setBodyPlain('');
    onCancel?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <RichTextEditor
        value={body}
        onChange={handleEditorChange}
        placeholder={placeholder}
        minHeight="120px"
      />

      <div className="flex items-center justify-end gap-x-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={!bodyPlain.trim() || isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
