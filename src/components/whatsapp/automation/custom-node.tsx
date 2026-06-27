'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getNodeDefinition } from '@/lib/whatsapp/automation/node-definitions';

export const CustomNode = memo(({ data, selected }: NodeProps) => {
    const definition = getNodeDefinition(data.nodeType, data.subType);

    if (!definition) {
        return (
            <Card className="p-4 min-w-[200px]">
                <div className="text-sm text-destructive">Unknown node type</div>
            </Card>
        );
    }

    const isTrigger = definition.type === 'trigger';
    const isEnd = definition.subType === 'end';

    return (
        <Card
            className={cn(
                'min-w-[220px] transition-all duration-200',
                selected && 'ring-2 ring-primary shadow-lg'
            )}
            style={{
                borderLeft: `4px solid ${definition.color}`,
            }}
        >
            {/* Input Handle - not for trigger nodes */}
            {!isTrigger && (
                <Handle
                    type="target"
                    position={Position.Top}
                    className="!bg-primary !w-3 !h-3 !border-2 !border-background"
                />
            )}

            <div className="p-3 space-y-2">
                {/* Header */}
                <div className="flex items-center gap-2">
                    <span className="text-2xl">{definition.icon}</span>
                    <div className="flex-1">
                        <div className="font-semibold text-sm">{data.label || definition.label}</div>
                        <div className="text-xs text-muted-foreground">{definition.category}</div>
                    </div>
                    <Badge
                        variant="outline"
                        style={{
                            borderColor: definition.color,
                            color: definition.color,
                        }}
                    >
                        {definition.type}
                    </Badge>
                </div>

                {/* Content Preview */}
                {data.preview && (
                    <div className="text-xs text-muted-foreground truncate bg-muted/50 p-2 rounded">
                        {data.preview}
                    </div>
                )}
            </div>

            {/* Output Handle - not for end nodes */}
            {!isEnd && (
                <Handle
                    type="source"
                    position={Position.Bottom}
                    className="!bg-primary !w-3 !h-3 !border-2 !border-background"
                />
            )}

            {/* Multiple outputs for branch nodes */}
            {definition.subType === 'branch' && (
                <>
                    <Handle
                        type="source"
                        position={Position.Bottom}
                        id="true"
                        className="!bg-green-500 !w-3 !h-3 !border-2 !border-background !left-1/4"
                    />
                    <Handle
                        type="source"
                        position={Position.Bottom}
                        id="false"
                        className="!bg-red-500 !w-3 !h-3 !border-2 !border-background !left-3/4"
                    />
                </>
            )}
        </Card>
    );
});

CustomNode.displayName = 'CustomNode';
