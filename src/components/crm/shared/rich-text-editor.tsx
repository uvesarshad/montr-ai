'use client';

import { Textarea } from '@/components/ui/textarea';

interface RichTextEditorProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Basic rich text editor component
 * This is a simple textarea implementation for now.
 * The CRM-RichText agent will replace this with a full TipTap editor.
 */
export function RichTextEditor({ value, onChange, placeholder, className }: RichTextEditorProps) {
  return (
    <Textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      rows={6}
    />
  );
}
