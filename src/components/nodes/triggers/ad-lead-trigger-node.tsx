'use client';

/**
 * Trigger node for captured ad leads (Meta Lead Ads / Google lead forms).
 *
 * Fires AFTER the automatic CRM intake when /api/webhooks/{meta-leads,
 * google-leads} stores a new lead. Config persists into node.data:
 *   platform   — 'all' | 'meta_ads' | 'google_ads'
 *   formId     — comma-separated form-ID filter (empty = all forms)
 *   campaignId — comma-separated campaign-ID filter (empty = all campaigns)
 */

import React, { memo } from 'react';
import { Position, NodeProps } from 'reactflow';
import { UserPlus, Zap } from 'lucide-react';
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

interface AdLeadTriggerData {
    platform?: 'all' | 'meta_ads' | 'google_ads';
    formId?: string;
    campaignId?: string;
}

function AdLeadTriggerNode({ id, data, selected }: NodeProps<AdLeadTriggerData>) {
    const { updateNodeData, deleteNode } = useNodeUtils(id);

    const platform = data.platform || 'all';

    return (
        <NodeShell
            id={id}
            nodeType="triggerAdLead"
            selected={selected}
            title="Ad Lead Captured"
            icon={<UserPlus className="size-3.5" />}
            minWidth={300}
            hasAdvanced={true}
            onDelete={deleteNode}
        >
            <div className="nodrag space-y-4 p-4">
                <div className="flex items-center gap-2 rounded-xl bg-purple-100/50 p-3 dark:bg-purple-900/20">
                    <Zap className="size-5 text-purple-500" />
                    <div className="flex-1">
                        <p className="text-xs font-medium text-purple-700 dark:text-purple-300">
                            Ad Lead Trigger
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Starts when a lead arrives from a lead form
                        </p>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Platform</Label>
                    <Select
                        value={platform}
                        onValueChange={(v) => updateNodeData({ platform: v === 'all' ? undefined : v })}
                    >
                        <SelectTrigger className="h-8 rounded-xl text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All platforms</SelectItem>
                            <SelectItem value="meta_ads">Meta Lead Ads</SelectItem>
                            <SelectItem value="google_ads">Google lead forms</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Form IDs (comma-separated, empty = all)</Label>
                    <Input
                        value={data.formId || ''}
                        onChange={(e) => updateNodeData({ formId: e.target.value })}
                        placeholder="e.g. 1234567890"
                        className="h-8 rounded-xl text-xs"
                    />
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Campaign IDs (comma-separated, empty = all)</Label>
                    <Input
                        value={data.campaignId || ''}
                        onChange={(e) => updateNodeData({ campaignId: e.target.value })}
                        placeholder="e.g. 23850000000000000"
                        className="h-8 rounded-xl text-xs"
                    />
                </div>

                <div className="rounded-lg bg-muted/30 p-2">
                    <p className="text-[10px] leading-snug text-muted-foreground">
                        <span className="font-medium">Outputs:</span> platform, campaign, form, email,
                        phone, name, raw fields, CRM syncStatus + contactId. The lead is already in the
                        CRM when this fires — use it for follow-ups, routing, and alerts.
                    </p>
                </div>
            </div>

            <NodeHandle type="source" position={Position.Right} nodeType="triggerAdLead" />
        </NodeShell>
    );
}

export default memo(AdLeadTriggerNode);
