'use client';

/**
 * Text mode for the unified workspace.
 *
 * Reuses the proven chat engine (useChat) + ChatInput/ChatMessage, so streaming,
 * multi-turn context, title generation, and summarization all work unchanged.
 * Text threads remain in the Conversation model for now (full backfill to
 * AiStudioProject sessions is M3); the workspace surfaces them in the unified
 * history sidebar. Full-width chat column — model selection lives in ChatInput,
 * so Text has no separate right-hand params panel.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquare, Sparkles } from 'lucide-react';

import { ChatInput } from '@/components/chat/chat-input';
import { ChatMessage } from '@/components/chat/chat-message';
import { Button, Spinner, EmptyState, TextEffect } from '@/components/ui-kit';
import { useChat } from '@/hooks/use-chat';

interface TextModeProps {
  conversationId: string | null;
  /** Create a fresh conversation and select it (used by the empty state). */
  onRequestNew: () => void;
  /** Fired when the thread changes (title/messages) so the sidebar can refresh. */
  onActivity?: () => void;
}

export function TextMode({ conversationId, onRequestNew, onActivity }: TextModeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(50);

  const {
    messages,
    isLoading,
    isLoadingConversation,
    selectedModel,
    sendMessage,
    handleModelChange,
    clearHistory,
  } = useChat({ conversationId: conversationId ?? undefined, onTitleGenerated: () => onActivity?.() });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(
    async (content: string) => {
      await sendMessage(content);
      onActivity?.();
    },
    [sendMessage, onActivity],
  );

  // Empty state — no thread selected yet.
  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          icon={MessageSquare}
          title={
            <TextEffect per="word" preset="fade-in-blur" as="span">
              Text
            </TextEffect>
          }
          note="Draft, reason, summarize, and iterate with conversational AI. Start a new chat to begin."
          cta={
            <Button variant="primary" icon={Sparkles} onClick={onRequestNew}>
              New chat
            </Button>
          }
        />
      </div>
    );
  }

  if (isLoadingConversation) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  const visibleMessages = messages.slice(-visibleCount);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-10">
              <EmptyState
                icon={MessageSquare}
                title="Start the conversation below"
                note="Your next prompt becomes the opening message in this thread."
              />
            </div>
          ) : null}

          {messages.length > 50 && visibleCount < messages.length ? (
            <div className="flex justify-center pb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((c) => Math.min(c + 50, messages.length))}
              >
                Load earlier messages
              </Button>
            </div>
          ) : null}

          {visibleMessages.map((message, index) => (
            <ChatMessage
              key={`${message.timestamp.toISOString()}-${message.role}`}
              role={message.role}
              content={message.content}
              model={message.model}
              isStreaming={isLoading && index === visibleMessages.length - 1 && message.role === 'assistant'}
            />
          ))}

          {isLoading && messages[messages.length - 1]?.role === 'user' ? (
            <div className="flex items-center gap-2.5 pb-2 text-muted-foreground">
              <div className="rounded-full border border-border p-1.5">
                <Loader2 className="size-3.5 animate-spin" />
              </div>
              <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[12.5px]">
                <span className="inline-flex items-center gap-1.5">
                  <Sparkles className="size-3.5" />
                  Thinking…
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Input footer */}
      <div className="border-t border-border bg-secondary/20 px-3 py-3 sm:px-4">
        <div className="mx-auto max-w-3xl">
          <ChatInput
            onSend={handleSend}
            onModelChange={handleModelChange}
            onClearHistory={clearHistory}
            selectedModel={selectedModel}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
