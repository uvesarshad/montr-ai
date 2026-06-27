'use client';

import React, { memo, useState, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { RotateCcw, List } from 'lucide-react';
import NodeShell from '../node-shell';
import NodeHandle from '../node-handle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LoopNodeData {
    arrayPath?: string;
    itemVariable?: string;
    indexVariable?: string;
}

function LoopNode({ id, data, selected }: NodeProps<LoopNodeData>) {
    const [arrayPath, setArrayPath] = useState(data.arrayPath || '{{$trigger.items}}');
    const [itemVariable, setItemVariable] = useState(data.itemVariable || 'item');
    const [indexVariable, setIndexVariable] = useState(data.indexVariable || 'index');

    const handleDelete = useCallback(() => {
        // Will be handled by parent
    }, []);

    return (
        <NodeShell
            id={id}
            nodeType="logicLoop"
            selected={selected}
            title="Loop"
            icon={<RotateCcw className="size-3.5" />}
            minWidth={280}
            minHeight={240}
            onDelete={handleDelete}
        >
            <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 p-3 bg-purple-100/50 dark:bg-purple-900/20 rounded-xl">
                    <List className="size-5 text-purple-500" />
                    <div className="flex-1">
                        <p className="text-xs font-medium text-purple-700 dark:text-purple-300">
                            Loop
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Iterate over array items
                        </p>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label className="text-xs">Array to loop over</Label>
                        <Input
                            value={arrayPath}
                            onChange={(e) => setArrayPath(e.target.value)}
                            placeholder="{{$trigger.items}}"
                            className="h-9 rounded-xl text-xs font-mono"
                        />
                    </div>

                    <div className="flex gap-2">
                        <div className="flex-1 space-y-1">
                            <Label className="text-xs">Item variable</Label>
                            <Input
                                value={itemVariable}
                                onChange={(e) => setItemVariable(e.target.value)}
                                placeholder="item"
                                className="h-9 rounded-xl text-xs font-mono"
                            />
                        </div>
                        <div className="flex-1 space-y-1">
                            <Label className="text-xs">Index variable</Label>
                            <Input
                                value={indexVariable}
                                onChange={(e) => setIndexVariable(e.target.value)}
                                placeholder="index"
                                className="h-9 rounded-xl text-xs font-mono"
                            />
                        </div>
                    </div>

                    <p className="text-[10px] text-muted-foreground">
                        Access current item with <code className="bg-muted px-1 rounded">{`{{$${itemVariable}}}`}</code>
                    </p>
                </div>

                {/* Output labels */}
                <div className="flex justify-between text-[10px] font-medium px-1">
                    <span className="text-blue-600">↺ Each Item</span>
                    <span className="text-green-600">✓ Complete</span>
                </div>
            </div>

            {/* Input handle */}
            <NodeHandle
                type="target"
                position={Position.Left}
                nodeType="logicLoop"
            />

            {/* Loop body output */}
            <NodeHandle
                type="source"
                position={Position.Right}
                id="loop"
                style={{ top: '40%' }}
                tone="info"
            />

            {/* Complete output */}
            <NodeHandle
                type="source"
                position={Position.Right}
                id="complete"
                style={{ top: '60%' }}
                tone="success"
            />
        </NodeShell>
    );
}

export default memo(LoopNode);
