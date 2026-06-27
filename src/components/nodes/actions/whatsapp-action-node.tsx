'use client';

import React, { memo, useState, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import NodeShell from '../node-shell';
import NodeHandle from '../node-handle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WhatsAppLogo } from '@/components/social-icons';

interface WhatsAppActionData {
    messageType?: 'text' | 'template';
    message?: string;
    templateId?: string;
    recipientField?: string;
}

function WhatsAppActionNode({ id, data, selected }: NodeProps<WhatsAppActionData>) {
    const [messageType, setMessageType] = useState(data.messageType || 'text');
    const [message, setMessage] = useState(data.message || '');
    const [templateId, setTemplateId] = useState(data.templateId || '');
    const [recipientField, setRecipientField] = useState(data.recipientField || '{{$trigger.contact.phone}}');

    const handleDelete = useCallback(() => {
        // Will be handled by parent
    }, []);

    return (
        <NodeShell
            id={id}
            nodeType="actionWhatsApp"
            selected={selected}
            title="Send WhatsApp"
            icon={<WhatsAppLogo className="size-3.5" />}
            minWidth={300}
            minHeight={280}
            onDelete={handleDelete}
        >
            <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 p-3 bg-green-100/50 dark:bg-green-900/20 rounded-xl">
                    <WhatsAppLogo className="size-5 text-green-500" />
                    <div className="flex-1">
                        <p className="text-xs font-medium text-green-700 dark:text-green-300">
                            Send WhatsApp
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Send message via WhatsApp
                        </p>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label className="text-xs">Recipient</Label>
                        <Input
                            value={recipientField}
                            onChange={(e) => setRecipientField(e.target.value)}
                            placeholder="{{$trigger.contact.phone}}"
                            className="h-9 rounded-xl text-xs font-mono"
                        />
                    </div>

                    <Tabs value={messageType} onValueChange={(v) => setMessageType(v as 'text' | 'template')}>
                        <TabsList className="w-full h-8">
                            <TabsTrigger value="text" className="flex-1 text-xs">Text</TabsTrigger>
                            <TabsTrigger value="template" className="flex-1 text-xs">Template</TabsTrigger>
                        </TabsList>

                        <TabsContent value="text" className="mt-3">
                            <div className="space-y-1">
                                <Label className="text-xs">Message</Label>
                                <Textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="Hello {{$trigger.contact.firstName}}! Your order is ready."
                                    className="min-h-[80px] rounded-xl text-xs resize-none"
                                />
                            </div>
                        </TabsContent>

                        <TabsContent value="template" className="mt-3">
                            <div className="space-y-1">
                                <Label className="text-xs">Template ID</Label>
                                <Input
                                    value={templateId}
                                    onChange={(e) => setTemplateId(e.target.value)}
                                    placeholder="welcome_message"
                                    className="h-9 rounded-xl text-xs"
                                />
                                <p className="text-[10px] text-muted-foreground">
                                    Use pre-approved WhatsApp templates
                                </p>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            {/* Input handle */}
            <NodeHandle
                type="target"
                position={Position.Left}
                nodeType="actionWhatsApp"
            />

            {/* Output handle */}
            <NodeHandle
                type="source"
                position={Position.Right}
                nodeType="actionWhatsApp"
            />
        </NodeShell>
    );
}

export default memo(WhatsAppActionNode);
