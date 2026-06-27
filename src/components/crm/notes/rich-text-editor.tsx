'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { EditorToolbar } from './editor-toolbar';
import { cn } from '@/lib/utils';
import { useEffect } from 'react';

interface RichTextEditorProps {
  value?: string; // JSON string or HTML
  onChange: (json: string, text: string) => void; // Return both JSON and plain text
  placeholder?: string;
  editable?: boolean; // For read-only mode
  className?: string;
  minHeight?: string;
}

/**
 * TipTap-powered rich text editor component for CRM notes
 *
 * Features:
 * - Text formatting (bold, italic, underline, strikethrough)
 * - Headings (H1, H2, H3)
 * - Lists (bullet, numbered, task)
 * - Links
 * - Text alignment
 * - Blockquotes and code blocks
 *
 * Stores content as JSON with plain text extraction for search.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write something...',
  editable = true,
  className,
  minHeight = '200px',
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-500 underline cursor-pointer hover:text-blue-600',
        },
      }),
      Placeholder.configure({
        placeholder,
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
    editable,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none',
          'px-3 py-2',
          !editable && 'cursor-default'
        ),
      },
    },
    onUpdate: ({ editor }) => {
      const json = JSON.stringify(editor.getJSON());
      const text = editor.getText();
      onChange(json, text);
    },
  });

  // Update editor content when value changes externally
  useEffect(() => {
    if (editor && value) {
      try {
        // Try to parse as JSON first
        const parsedValue = JSON.parse(value);
        const currentContent = JSON.stringify(editor.getJSON());
        const newContent = JSON.stringify(parsedValue);

        // Only update if content actually changed to avoid cursor jumps
        if (currentContent !== newContent) {
          editor.commands.setContent(parsedValue);
        }
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
                  text: value,
                },
              ],
            },
          ],
        };
        editor.commands.setContent(plainTextContent);
      }
    }
  }, [value, editor]);

  // Update editable state
  useEffect(() => {
    if (editor) {
      editor.setEditable(editable);
    }
  }, [editable, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div
      className={cn(
        'border rounded-md overflow-hidden bg-background',
        !editable && 'border-muted',
        className
      )}
    >
      {editable && <EditorToolbar editor={editor} />}
      <div
        className="overflow-y-auto"
        style={{ minHeight }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
