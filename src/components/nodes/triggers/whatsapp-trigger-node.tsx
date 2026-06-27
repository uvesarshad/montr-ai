'use client';

import React, { memo, useState, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { MessageSquare, Phone } from 'lucide-react';
import NodeShell from '../node-shell';
import NodeHandle from '../node-handle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface WhatsAppTriggerData {
    accountFilter?: string;
    keywordFilter?: string;
    contactGroupFilter?: string;
    triggerType?: 'any_message' | 'keyword' | 'contact_group';
}

function WhatsAppTriggerNode({ id, data, selected }: NodeProps<WhatsAppTriggerData>) {
    const [triggerType, setTriggerType] = useState<string>(data.triggerType || 'any_message');
    const [keywordFilter, setKeywordFilter] = useState(data.keywordFilter || '');

    const handleDelete = useCallback(() => {
        // Handled by parent
    }, []);

    return (
        <NodeShell
            id={id}
            nodeType="triggerWhatsApp"
            selected={selected}
            title="WhatsApp Trigger"
            icon={<Phone className="size-3.5" />}
            minWidth={300}
            minHeight={220}
            hasAdvanced={true}
            onDelete={handleDelete}
        >
            <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 p-3 bg-green-100/50 dark:bg-green-900/20 rounded-xl">
                    <MessageSquare className="size-5 text-green-500" />
                    <div className="flex-1">
                        <p className="text-xs font-medium text-green-700 dark:text-green-300">
                            WhatsApp Trigger
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Triggers on incoming WhatsApp messages
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
                                <SelectItem value="keyword">Message Contains Keyword</SelectItem>
                                <SelectItem value="contact_group">From Contact Group</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {triggerType === 'keyword' && (
                        <div className="space-y-2">
                            <Label className="text-xs">Keyword Filter</Label>
                            <Input
                                value={keywordFilter}
                                onChange={(e) => setKeywordFilter(e.target.value)}
                                placeholder="e.g., order, help, hello"
                                className="h-9 rounded-xl text-xs"
                            />
                            <p className="text-[10px] text-muted-foreground">
                                Separate multiple keywords with commas
                            </p>
                        </div>
                    )}

                    {triggerType === 'contact_group' && (
                        <div className="space-y-2">
                            <Label className="text-xs">Contact Group</Label>
                            <Select>
                                <SelectTrigger className="h-9 rounded-xl text-xs">
                                    <SelectValue placeholder="Select a group" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Contacts</SelectItem>
                                    <SelectItem value="vip">VIP Customers</SelectItem>
                                    <SelectItem value="leads">New Leads</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>
            </div>

            {/* Output handle */}
            <NodeHandle
                type="source"
                position={Position.Right}
                nodeType="triggerWhatsApp"
            />
        </NodeShell>
    );
}

export default memo(WhatsAppTriggerNode);
