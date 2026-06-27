'use client';

import React, { memo, useState, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { Webhook, Copy, Check } from 'lucide-react';
import NodeShell from '../node-shell';
import NodeHandle from '../node-handle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface WebhookTriggerData {
    webhookUrl?: string;
    webhookId?: string;
}

function WebhookTriggerNode({ id, data, selected }: NodeProps<WebhookTriggerData>) {
    const [copied, setCopied] = useState(false);

    // Generate webhook URL based on canvas ID
    const webhookUrl = data.webhookUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/api/v2/webhooks/${data.webhookId || id}`;

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(webhookUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }, [webhookUrl]);

    const handleDelete = useCallback(() => {
        // Will be handled by parent
    }, []);

    return (
        <NodeShell
            id={id}
            nodeType="triggerWebhook"
            selected={selected}
            title="Webhook Trigger"
            icon={<Webhook className="size-3.5" />}
            minWidth={300}
            minHeight={180}
            onDelete={handleDelete}
        >
            <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 p-3 bg-orange-100/50 dark:bg-orange-900/20 rounded-xl">
                    <Webhook className="size-5 text-orange-500" />
                    <div className="flex-1">
                        <p className="text-xs font-medium text-orange-700 dark:text-orange-300">
                            Webhook Trigger
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Receives HTTP POST requests
                        </p>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label className="text-xs">Webhook URL</Label>
                    <div className="flex gap-2">
                        <Input
                            value={webhookUrl}
                            readOnly
                            className="text-xs h-9 rounded-xl bg-muted/50 font-mono"
                        />
                        <Button
                            size="icon"
                            variant="outline"
                            className="size-9 rounded-xl shrink-0"
                            onClick={handleCopy}
                        >
                            {copied ? (
                                <Check className="size-4 text-green-500" />
                            ) : (
                                <Copy className="size-4" />
                            )}
                        </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                        Send a POST request to this URL to trigger the workflow
                    </p>
                </div>
            </div>

            {/* Output handle */}
            <NodeHandle
                type="source"
                position={Position.Right}
                nodeType="triggerWebhook"
            />
        </NodeShell>
    );
}

export default memo(WebhookTriggerNode);
