'use client';

import { useRef, useState } from 'react';
import { Bot } from 'lucide-react';

import { ChatBubble, MessageComposer } from '@/components/ui-kit';

interface PreviewMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatbotPreviewPanelProps {
  widgetToken: string;
  primaryColor?: string;
  botName?: string;
  botIcon?: string;
  greeting?: string;
  placeholder?: string;
}

export function ChatbotPreviewPanel({
  widgetToken,
  primaryColor = '#3B82F6',
  botName = 'Bot',
  botIcon = 'AI',
  greeting = 'Hi! How can I help you today?',
  placeholder = 'Type your message...',
}: ChatbotPreviewPanelProps) {
  const [messages, setMessages] = useState<PreviewMessage[]>([
    { role: 'assistant', content: greeting },
  ]);
  const [loading, setLoading] = useState(false);
  const sessionId = useRef(`preview_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function sendMessage(text: string) {
    if (!text || loading) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chatbot/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widgetToken,
          sessionId: sessionId.current,
          content: text,
          testMode: true,
        }),
      });

      const data = await res.json();
      const reply = data.reply || "I'm having trouble responding right now.";
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Failed to get a response. Please try again.' },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }

  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-card"
      style={{ height: 480 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: primaryColor }}>
        <div className="flex size-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white">
          {botIcon}
        </div>
        <div>
          <div className="text-sm font-semibold text-white">{botName}</div>
          <div className="text-[10px] text-white/70">Test mode · visitors not saved</div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {messages.map((msg, i) => (
          <ChatBubble key={i} dir={msg.role === 'user' ? 'out' : 'in'}>
            {msg.content}
          </ChatBubble>
        ))}

        {loading ? (
          <ChatBubble dir="in">
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Bot className="size-3.5" />
              <span className="flex gap-1">
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current" />
              </span>
            </span>
          </ChatBubble>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border px-3 py-3">
        <MessageComposer
          onSubmit={(text) => void sendMessage(text)}
          placeholder={placeholder}
          disabled={loading}
        />
      </div>
    </div>
  );
}
