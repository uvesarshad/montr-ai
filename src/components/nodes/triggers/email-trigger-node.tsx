'use client';

import React, { memo, useState, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { Mail, Inbox } from 'lucide-react';
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

interface EmailTriggerData {
    provider?: 'gmail' | 'outlook';
    filterType?: 'any' | 'subject' | 'sender' | 'label';
    filterValue?: string;
}

function EmailTriggerNode({ id, data, selected }: NodeProps<EmailTriggerData>) {
    const [provider, setProvider] = useState<string>(data.provider || 'gmail');
    const [filterType, setFilterType] = useState<string>(data.filterType || 'any');
    const [filterValue, setFilterValue] = useState(data.filterValue || '');

    const handleDelete = useCallback(() => {
        // Handled by parent
    }, []);

    return (
        <NodeShell
            id={id}
            nodeType="triggerEmail"
            selected={selected}
            title="Email Trigger"
            icon={<Mail className="size-3.5" />}
            minWidth={300}
            minHeight={220}
            hasAdvanced={true}
            onDelete={handleDelete}
        >
            <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 p-3 bg-blue-100/50 dark:bg-blue-900/20 rounded-xl">
                    <Inbox className="size-5 text-blue-500" />
                    <div className="flex-1">
                        <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                            Email Trigger
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Triggers on incoming email
                        </p>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label className="text-xs">Email Provider</Label>
                        <Select value={provider} onValueChange={setProvider}>
                            <SelectTrigger className="h-9 rounded-xl text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="gmail">Gmail</SelectItem>
                                <SelectItem value="outlook">Outlook</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs">Filter By</Label>
                        <Select value={filterType} onValueChange={setFilterType}>
                            <SelectTrigger className="h-9 rounded-xl text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="any">Any Email</SelectItem>
                                <SelectItem value="subject">Subject Contains</SelectItem>
                                <SelectItem value="sender">From Sender</SelectItem>
                                <SelectItem value="label">Has Label</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {filterType !== 'any' && (
                        <div className="space-y-2">
                            <Label className="text-xs">
                                {filterType === 'subject' ? 'Subject keyword' :
                                    filterType === 'sender' ? 'Sender email' : 'Label name'}
                            </Label>
                            <Input
                                value={filterValue}
                                onChange={(e) => setFilterValue(e.target.value)}
                                placeholder={
                                    filterType === 'subject' ? 'e.g., invoice, order confirmation' :
                                        filterType === 'sender' ? 'e.g., support@company.com' : 'e.g., important'
                                }
                                className="h-9 rounded-xl text-xs"
                            />
                        </div>
                    )}
                </div>

                {/* Output info */}
                <div className="rounded-lg bg-muted/30 p-2">
                    <p className="text-[10px] text-muted-foreground">
                        <span className="font-medium">Outputs:</span> subject, body, sender, attachments
                    </p>
                </div>
            </div>

            {/* Output handle */}
            <NodeHandle
                type="source"
                position={Position.Right}
                nodeType="triggerEmail"
            />
        </NodeShell>
    );
}

export default memo(EmailTriggerNode);
