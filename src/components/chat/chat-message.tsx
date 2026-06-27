'use client';

import React, { memo } from 'react';
import { Bot, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface ChatMessageProps {
    role: 'user' | 'assistant';
    content: string;
    model?: string;
    isStreaming?: boolean;
}

export const ChatMessage = memo(function ChatMessage({
    role,
    content,
    model,
    isStreaming,
}: ChatMessageProps) {
    const isUser = role === 'user';

    return (
        <div
            className={cn(
                'flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300',
                isUser && 'justify-end'
            )}
        >
            {!isUser && (
                <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                    <Bot className="size-4 text-primary" />
                </div>
            )}
            <div
                className={cn(
                    'rounded-2xl px-4 py-2.5 text-sm shadow-sm max-w-[85%]',
                    isUser
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/80 backdrop-blur-sm'
                )}
            >
                <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
                {!isUser && model && (
                    <div className="mt-1.5 flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 h-4 font-normal text-muted-foreground">
                            {model.split('/').pop()}
                        </Badge>
                        {isStreaming && (
                            <span className="inline-flex">
                                <span className="animate-pulse">●</span>
                            </span>
                        )}
                    </div>
                )}
            </div>
            {isUser && (
                <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0 border border-border/50">
                    <User className="size-4 text-muted-foreground" />
                </div>
            )}
        </div>
    );
});
