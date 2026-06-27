'use client';

import React, { memo, useState, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { Mail, Users } from 'lucide-react';
import NodeShell from '../node-shell';
import NodeHandle from '../node-handle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';



interface MarketingEmailData {
    subject?: string;
    fromName?: string;
    templateId?: string;
    listId?: string;
    content?: string;
}

function MarketingEmailNode({ id, data, selected }: NodeProps<MarketingEmailData>) {
    const [subject, setSubject] = useState(data.subject || '');
    const [fromName, setFromName] = useState(data.fromName || '');
    const [content, setContent] = useState(data.content || '');
    const [listId, setListId] = useState(data.listId || '');

    const handleDelete = useCallback(() => {
        // Will be handled by parent
    }, []);

    return (
        <NodeShell
            id={id}
            nodeType="actionMarketingEmail"
            selected={selected}
            title="Marketing Email"
            icon={<Mail className="size-3.5" />}
            minWidth={320}
            minHeight={320}
            onDelete={handleDelete}
        >
            <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 p-3 bg-blue-100/50 dark:bg-blue-900/20 rounded-xl">
                    <Users className="size-5 text-blue-500" />
                    <div className="flex-1">
                        <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
                            Marketing Email
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Send bulk email to a campaign list
                        </p>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label className="text-xs">Email List / Segment</Label>
                        <Input
                            value={listId}
                            onChange={(e) => setListId(e.target.value)}
                            placeholder="Select or enter list ID"
                            className="h-9 rounded-xl text-xs"
                        />
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs">From Name</Label>
                        <Input
                            value={fromName}
                            onChange={(e) => setFromName(e.target.value)}
                            placeholder="Your Company"
                            className="h-9 rounded-xl text-xs"
                        />
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs">Subject</Label>
                        <Input
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="Check out our latest update!"
                            className="h-9 rounded-xl text-xs"
                        />
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs">Content Preview</Label>
                        <Textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Email content with {{variables}}..."
                            className="min-h-[60px] rounded-xl text-xs resize-none"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            Use variables like {`{{firstName}}`}, {`{{company}}`}
                        </p>
                    </div>
                </div>
            </div>

            {/* Input handle */}
            <NodeHandle
                type="target"
                position={Position.Left}
                nodeType="actionMarketingEmail"
            />

            {/* Output handle */}
            <NodeHandle
                type="source"
                position={Position.Right}
                nodeType="actionMarketingEmail"
            />
        </NodeShell>
    );
}

export default memo(MarketingEmailNode);
