'use client';

import { useState } from 'react';
import { Paperclip, Sparkles } from 'lucide-react';

import { IconButton, MessageComposer as KitMessageComposer } from '@/components/ui-kit';

interface MessageComposerProps {
  onSendMessage: (payload: { content: string; isNote?: boolean }) => Promise<void> | void;
  /** Placeholder for the reply mode (e.g. "Reply to Marcus on WhatsApp…"). */
  replyPlaceholder?: string;
}

const MODES = [
  { value: 'reply', label: 'Reply' },
  { value: 'note', label: 'Internal note' },
];

export default function MessageComposer({ onSendMessage, replyPlaceholder }: MessageComposerProps) {
  const [mode, setMode] = useState<'reply' | 'note'>('reply');

  const handleSubmit = async (text: string) => {
    await onSendMessage({ content: text, isNote: mode === 'note' });
    if (mode === 'note') {
      setMode('reply');
    }
  };

  return (
    <div className="border-t border-border bg-background px-4 py-3.5">
      <KitMessageComposer
        onSubmit={handleSubmit}
        modes={MODES}
        mode={mode}
        onModeChange={(value) => setMode(value as 'reply' | 'note')}
        placeholder={
          mode === 'note'
            ? 'Write an internal note visible only to your team…'
            : replyPlaceholder || 'Reply to the customer…'
        }
        submitLabel={mode === 'note' ? 'Save note' : 'Send'}
        actions={
          <>
            <IconButton icon={Paperclip} iconSize={16} aria-label="Attach" />
            <IconButton icon={Sparkles} iconSize={16} aria-label="AI suggest reply" className="text-brand-strong" />
          </>
        }
      />
    </div>
  );
}
