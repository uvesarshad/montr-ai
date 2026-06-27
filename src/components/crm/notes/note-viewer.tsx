'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';

interface NoteViewerProps {
  content: string; // JSON string or HTML
  className?: string;
}

/**
 * Read-only viewer component for displaying rich text notes
 *
 * Used in:
 * - Activity timeline items
 * - Contact/company/deal detail views
 * - Anywhere notes need to be displayed without editing
 */
export function NoteViewer({ content, className }: NoteViewerProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: {
          class: 'text-blue-500 underline cursor-pointer hover:text-blue-600',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      TaskList.configure({
        HTMLAttributes: {
          class: 'task-list',
        },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: 'task-item',
        },
      }),
    ],
    editable: false,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none cursor-default',
      },
    },
  });

  // Update editor content when content changes
  useEffect(() => {
    if (editor && content) {
      try {
        // Try to parse as JSON first
        const parsedContent = JSON.parse(content);
        editor.commands.setContent(parsedContent);
      } catch {
        // If not JSON, treat as plain text (migration from old format)
        const plainTextContent = {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: content,
                },
              ],
            },
          ],
        };
        editor.commands.setContent(plainTextContent);
      }
    } else if (editor && !content) {
      // Clear content if empty
      editor.commands.setContent('');
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  // Don't render if there's no content
  if (!content || content.trim() === '') {
    return null;
  }

  return (
    <div className={cn('text-sm', className)}>
      <EditorContent editor={editor} />
    </div>
  );
}
