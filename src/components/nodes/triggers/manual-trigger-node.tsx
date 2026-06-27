'use client';

import React, { memo, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { Play, MousePointer } from 'lucide-react';
import NodeShell from '../node-shell';
import NodeHandle from '../node-handle';
import { Button } from '@/components/ui/button';

interface ManualTriggerData {
    lastRun?: string;
}

function ManualTriggerNode({ id, data, selected }: NodeProps<ManualTriggerData>) {
    const handleDelete = useCallback(() => {
        // Will be handled by parent
    }, []);

    const handleTrigger = useCallback(() => {
        // This will be connected to execution context
        console.log('Manual trigger clicked for node:', id);
    }, [id]);

    return (
        <NodeShell
            id={id}
            nodeType="triggerManual"
            selected={selected}
            title="Manual Trigger"
            icon={<Play className="size-3.5" />}
            minWidth={280}
            minHeight={160}
            onDelete={handleDelete}
        >
            <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 p-3 bg-orange-100/50 dark:bg-orange-900/20 rounded-xl">
                    <MousePointer className="size-5 text-orange-500" />
                    <div className="flex-1">
                        <p className="text-xs font-medium text-orange-700 dark:text-orange-300">
                            Manual Trigger
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Click to run workflow
                        </p>
                    </div>
                </div>

                <Button
                    onClick={handleTrigger}
                    className="w-full h-10 rounded-xl bg-orange-500 hover:bg-orange-600 text-white"
                >
                    <Play className="size-4 mr-2" />
                    Run Workflow
                </Button>

                {data.lastRun && (
                    <p className="text-[10px] text-center text-muted-foreground">
                        Last run: {new Date(data.lastRun).toLocaleString()}
                    </p>
                )}
            </div>

            {/* Output handle */}
            <NodeHandle
                type="source"
                position={Position.Right}
                nodeType="triggerManual"
            />
        </NodeShell>
    );
}

export default memo(ManualTriggerNode);
