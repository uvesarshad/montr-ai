'use client';

import React, { memo, useState } from 'react';
import { Position, NodeProps } from 'reactflow';
import { BarChart3 } from 'lucide-react';
import NodeShell from './node-shell';
import { Label } from '@/components/ui/label';
import { useNodeUtils } from '@/hooks/use-node-utils';
import NodeHandle from './node-handle';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface AdsInsightsData {
    platform?: 'all' | 'meta_ads' | 'google_ads';
    entityType?: 'campaign' | 'account';
    days?: number;
}

/**
 * Ads Insights node — read-only pull of campaign/account metrics from the
 * unified metrics store at execution time. Never modifies campaigns (ads
 * write guardrail).
 */
function AdsInsightsNode({ id, data, isConnectable, selected }: NodeProps<AdsInsightsData>) {
    const { updateNodeData, deleteNode } = useNodeUtils(id);

    const [platform, setPlatform] = useState<string>(data.platform || 'all');
    const [entityType, setEntityType] = useState<string>(data.entityType || 'campaign');
    const [days, setDays] = useState<string>(String(data.days || 30));

    return (
        <NodeShell
            id={id}
            nodeType="adsInsightsNode"
            selected={selected}
            onDelete={deleteNode}
            minWidth={300}
            contentClassName="p-4 relative"
            title="Ads Insights"
            icon={<BarChart3 className="h-full w-full" />}
        >
            <NodeHandle type="target" position={Position.Left} nodeType="adsInsightsNode" isConnectable={isConnectable} />

            <div className="nodrag space-y-4">
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Platform</Label>
                        <Select
                            value={platform}
                            onValueChange={(value) => { setPlatform(value); updateNodeData({ platform: value }); }}
                        >
                            <SelectTrigger className="h-8 text-xs rounded-xl">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All platforms</SelectItem>
                                <SelectItem value="meta_ads">Meta Ads</SelectItem>
                                <SelectItem value="google_ads">Google Ads</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Level</Label>
                        <Select
                            value={entityType}
                            onValueChange={(value) => { setEntityType(value); updateNodeData({ entityType: value }); }}
                        >
                            <SelectTrigger className="h-8 text-xs rounded-xl">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="campaign">Campaigns</SelectItem>
                                <SelectItem value="account">Accounts</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Look-back window</Label>
                    <Select
                        value={days}
                        onValueChange={(value) => { setDays(value); updateNodeData({ days: Number(value) }); }}
                    >
                        <SelectTrigger className="h-8 text-xs rounded-xl">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="7">Last 7 days</SelectItem>
                            <SelectItem value="14">Last 14 days</SelectItem>
                            <SelectItem value="30">Last 30 days</SelectItem>
                            <SelectItem value="90">Last 90 days</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <p className="text-[10px] text-muted-foreground">
                    Outputs totals, a per-{entityType} table, and a text summary for AI nodes. Read-only — never
                    changes campaigns.
                </p>
            </div>

            <NodeHandle type="source" position={Position.Right} nodeType="adsInsightsNode" isConnectable={isConnectable} />
        </NodeShell>
    );
}

export default memo(AdsInsightsNode);
