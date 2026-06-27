'use client';

import React, { memo, useState, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import NodeShell from './node-shell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { TelegramLogo } from '@/components/social-icons';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import NodeHandle from './node-handle';
import { Loader2, Send } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface TelegramNodeData {
    messageType?: 'text' | 'photo' | 'document';
    chatId?: string;
    messageText?: string;
}

function TelegramNode({ id, data, isConnectable, selected }: NodeProps<TelegramNodeData>) {
    const { toast } = useToast();
    const { updateNodeData, deleteNode, getIncomingContent } = useNodeUtils(id);

    const [messageType, setMessageType] = useState<'text' | 'photo' | 'document'>(data.messageType || 'text');
    const [chatId, setChatId] = useState(data.chatId || '');
    const [messageText, setMessageText] = useState(data.messageText || '');
    const [isLoading, setIsLoading] = useState(false);

    const handleConfigure = useCallback(() => {
        const content = messageText || getIncomingContent();

        if (!chatId) {
            toast({ variant: 'destructive', title: 'Missing Chat ID', description: 'Please provide a target Chat ID or {{variable}}.' });
            return;
        }

        if (messageType === 'text' && !content) {
            toast({ variant: 'destructive', title: 'Missing Content', description: 'Please write a message or connect a content node.' });
            return;
        }

        setIsLoading(true);
        setTimeout(() => {
            updateNodeData({ messageType, chatId, messageText: content });
            toast({ title: 'Configured', description: 'Telegram action ready for execution.' });
            setIsLoading(false);
        }, 500);
    }, [chatId, messageType, messageText, getIncomingContent, updateNodeData, toast]);

    const handleDelete = useCallback(() => {
        deleteNode();
    }, [deleteNode]);

    return (
        <NodeShell
            id={id}
            nodeType="telegramNode"
            selected={selected}
            title="Telegram"
            icon={<TelegramLogo className="h-full w-full text-[#2AABEE]" />}
            minWidth={300}
            hasAdvanced={true}
            onDelete={handleDelete}
            contentClassName="p-4"
        >
            <NodeHandle type="target" position={Position.Left} nodeType="telegramNode" isConnectable={isConnectable} />

            <div className="nodrag space-y-4">
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Action Type</Label>
                    <Select value={messageType} onValueChange={(v) => setMessageType(v as 'text' | 'photo' | 'document')}>
                        <SelectTrigger className="h-8 text-xs rounded-xl">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="text">Send Text Message</SelectItem>
                            <SelectItem value="photo">Send Photo</SelectItem>
                            <SelectItem value="document">Send Document</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Bot Account</Label>
                    <Select>
                        <SelectTrigger className="h-8 text-xs rounded-xl">
                            <SelectValue placeholder="Select Bot Account" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="connect">Connect Telegram Bot →</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex justify-between">
                        <span>Target Chat ID</span>
                    </Label>
                    <Input
                        value={chatId}
                        onChange={(e) => setChatId(e.target.value)}
                        placeholder="e.g. 123456789 or {{telegram_chat_id}}"
                        className="h-8 text-xs rounded-xl"
                    />
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                        {messageType === 'text' ? 'Message Text' : 'Media URL or {{variable}}'}
                    </Label>
                    {messageType === 'text' ? (
                        <Textarea
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            placeholder="Write your message or connect a node..."
                            className="min-h-[60px] text-xs resize-none rounded-xl"
                            rows={3}
                        />
                    ) : (
                        <Input
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            placeholder="https://... or connect a node"
                            className="h-8 text-xs rounded-xl"
                        />
                    )}
                </div>

                <Button
                    size="sm"
                    className="w-full h-8 text-xs rounded-xl bg-[#2AABEE] hover:bg-[#2289BE] text-white"
                    onClick={handleConfigure}
                    disabled={isLoading}
                >
                    {isLoading ? <Loader2 className="size-3 mr-1.5 animate-spin" /> : <Send className="size-3 mr-1.5" />}
                    Configure Action
                </Button>
            </div>

            <NodeHandle type="source" position={Position.Right} nodeType="telegramNode" isConnectable={isConnectable} />
        </NodeShell>
    );
}

export default memo(TelegramNode);
