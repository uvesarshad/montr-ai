'use client';

/**
 * Trigger node for integrations-hub provider webhooks (Shopify, RevenueCat).
 *
 * Fires when /api/webhooks/{provider}/[connectionId] receives a verified
 * delivery whose topic matches. Config persists into node.data:
 *   provider — 'shopify' | 'revenuecat' | 'calendly' | 'stripe'
 *   topics   — comma-separated topic filter (empty = all topics)
 */

import React, { memo } from 'react';
import { Position, NodeProps } from 'reactflow';
import { Plug, Zap } from 'lucide-react';
import NodeShell from '../node-shell';
import NodeHandle from '../node-handle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useNodeUtils } from '@/hooks/use-node-utils';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface IntegrationWebhookTriggerData {
    provider?: 'shopify' | 'revenuecat' | 'calendly' | 'stripe';
    topics?: string;
}

const TOPIC_HINTS: Record<string, string> = {
    shopify: 'orders/create, orders/paid, carts/update, checkouts/create',
    revenuecat: 'INITIAL_PURCHASE, RENEWAL, CANCELLATION',
    calendly: 'invitee.created, invitee.canceled',
    stripe: 'checkout.session.completed, invoice.paid, customer.subscription.updated',
};

const PROVIDER_REQUIREMENT: Record<string, string> = {
    shopify: 'a connected Shopify store',
    revenuecat: 'a connected RevenueCat project',
    calendly: 'a connected Calendly account',
    stripe: 'a connected Stripe account',
};

function IntegrationWebhookTriggerNode({ id, data, selected }: NodeProps<IntegrationWebhookTriggerData>) {
    const { updateNodeData, deleteNode } = useNodeUtils(id);

    const provider = data.provider || 'shopify';
    const topics = data.topics || '';

    return (
        <NodeShell
            id={id}
            nodeType="triggerIntegrationWebhook"
            selected={selected}
            title="Integration Event"
            icon={<Plug className="size-3.5" />}
            minWidth={300}
            hasAdvanced={true}
            onDelete={deleteNode}
        >
            <div className="nodrag space-y-4 p-4">
                <div className="flex items-center gap-2 rounded-xl bg-purple-100/50 p-3 dark:bg-purple-900/20">
                    <Zap className="size-5 text-purple-500" />
                    <div className="flex-1">
                        <p className="text-xs font-medium text-purple-700 dark:text-purple-300">
                            Provider Webhook Trigger
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Starts when a connected app sends an event
                        </p>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Provider</Label>
                    <Select
                        value={provider}
                        onValueChange={(v) => updateNodeData({ provider: v })}
                    >
                        <SelectTrigger className="h-8 rounded-xl text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="shopify">Shopify</SelectItem>
                            <SelectItem value="revenuecat">RevenueCat</SelectItem>
                            <SelectItem value="calendly">Calendly</SelectItem>
                            <SelectItem value="stripe">Stripe</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Topics (comma-separated, empty = all)</Label>
                    <Input
                        value={topics}
                        onChange={(e) => updateNodeData({ topics: e.target.value })}
                        placeholder={TOPIC_HINTS[provider]}
                        className="h-8 rounded-xl text-xs"
                    />
                </div>

                <div className="rounded-lg bg-muted/30 p-2">
                    <p className="text-[10px] leading-snug text-muted-foreground">
                        <span className="font-medium">Outputs:</span> provider, topic, payload.
                        Requires {PROVIDER_REQUIREMENT[provider] || 'a connected app'} with
                        the webhook URL registered (Settings → Connections → Apps).
                    </p>
                </div>
            </div>

            <NodeHandle type="source" position={Position.Right} nodeType="triggerIntegrationWebhook" />
        </NodeShell>
    );
}

export default memo(IntegrationWebhookTriggerNode);
