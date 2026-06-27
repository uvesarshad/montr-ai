'use client';

import React, { memo, useState, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { MessageCircle } from 'lucide-react';
import NodeShell from '../node-shell';
import NodeHandle from '../node-handle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TelegramLogo } from '@/components/social-icons';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface TelegramTriggerData {
    triggerType?: 'any_message' | 'text_only' | 'keyword' | 'media';
    keywordFilter?: string;
}

function TelegramTriggerNode({ id, data, selected }: NodeProps<TelegramTriggerData>) {
    const [triggerType, setTriggerType] = useState<string>(data.triggerType || 'any_message');
    const [keywordFilter, setKeywordFilter] = useState(data.keywordFilter || '');

    const handleDelete = useCallback(() => {
        // Handled by parent
    }, []);

    return (
        <NodeShell
            id={id}
            nodeType="triggerTelegram"
            selected={selected}
            title="Telegram Trigger"
            icon={<TelegramLogo className="size-3.5" />}
            minWidth={300}
            minHeight={220}
            hasAdvanced={true}
            onDelete={handleDelete}
        >
            <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 p-3 bg-[#2AABEE]/10 dark:bg-[#2AABEE]/20 rounded-xl">
                    <MessageCircle className="size-5 text-[#2AABEE]" />
                    <div className="flex-1">
                        <p className="text-xs font-medium text-[#2AABEE] dark:text-[#2AABEE]">
                            Telegram Bot Trigger
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Triggers on incoming messages to your bot
                        </p>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label className="text-xs">Trigger When</Label>
                        <Select value={triggerType} onValueChange={setTriggerType}>
                            <SelectTrigger className="h-9 rounded-xl text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="any_message">Any Message Received</SelectItem>
                                <SelectItem value="text_only">Text Message Only</SelectItem>
                                <SelectItem value="keyword">Message Contains Keyword</SelectItem>
                                <SelectItem value="media">Media/Files Attached</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {triggerType === 'keyword' && (
                        <div className="space-y-2">
                            <Label className="text-xs">Keyword Filter</Label>
                            <Input
                                value={keywordFilter}
                                onChange={(e) => setKeywordFilter(e.target.value)}
                                placeholder="e.g., /start, help, support"
                                className="h-9 rounded-xl text-xs"
                            />
                            <p className="text-[10px] text-muted-foreground">
                                Separate multiple keywords with commas
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Output handle */}
            <NodeHandle
                type="source"
                position={Position.Right}
                nodeType="triggerTelegram"
            />
        </NodeShell>
    );
}

export default memo(TelegramTriggerNode);
