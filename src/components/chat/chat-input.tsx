'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ModelSelector, ModelOption } from '@/components/nodes/model-selector';
import { Send, Loader2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
    onSend: (content: string) => void;
    onModelChange: (modelId: string, model: ModelOption) => void;
    onClearHistory?: () => void;
    selectedModel?: string;
    isLoading?: boolean;
    disabled?: boolean;
    className?: string;
}

export function ChatInput({
    onSend,
    onModelChange,
    onClearHistory,
    selectedModel,
    isLoading = false,
    disabled = false,
    className,
}: ChatInputProps) {
    const [value, setValue] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    }, [value]);

    const handleSubmit = () => {
        if (!value.trim() || isLoading || disabled) return;
        onSend(value.trim());
        setValue('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <div
            className={cn(
                'border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
                className
            )}
        >
            <div className="max-w-4xl mx-auto p-4 space-y-3">
                {/* Model Selector Row */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <ModelSelector
                            value={selectedModel}
                            onValueChange={onModelChange}
                            modelType="text"
                            triggerClassName="h-8 text-xs"
                        />
                    </div>
                    {onClearHistory && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onClearHistory}
                            className="h-8 text-xs text-muted-foreground hover:text-foreground"
                        >
                            <RotateCcw className="size-3 mr-1" />
                            Clear
                        </Button>
                    )}
                </div>

                {/* Input Row */}
                <div className="flex items-end gap-2">
                    <div className="flex-1 relative">
                        <Textarea
                            ref={textareaRef}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Type a message... (Shift+Enter for new line)"
                            className="min-h-[44px] max-h-[200px] resize-none pr-12 rounded-2xl border-border/50 focus:border-primary/50 shadow-sm"
                            rows={1}
                            disabled={isLoading || disabled}
                        />
                    </div>
                    <Button
                        onClick={handleSubmit}
                        disabled={!value.trim() || isLoading || disabled}
                        size="icon"
                        className="size-11 rounded-full shrink-0 shadow-lg"
                    >
                        {isLoading ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <Send className="size-4" />
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
