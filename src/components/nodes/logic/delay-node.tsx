'use client';

import React, { memo, useState, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { Clock, Timer } from 'lucide-react';
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

interface DelayNodeData {
    duration?: number;
    unit?: 'seconds' | 'minutes' | 'hours' | 'days';
}

function DelayNode({ id, data, selected }: NodeProps<DelayNodeData>) {
    const [duration, setDuration] = useState(data.duration || 5);
    const [unit, setUnit] = useState(data.unit || 'minutes');

    const handleDelete = useCallback(() => {
        // Will be handled by parent
    }, []);

    const getDisplayText = () => {
        return `Wait ${duration} ${unit}`;
    };

    return (
        <NodeShell
            id={id}
            nodeType="logicDelay"
            selected={selected}
            title="Delay"
            icon={<Clock className="size-3.5" />}
            minWidth={260}
            minHeight={180}
            onDelete={handleDelete}
        >
            <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 p-3 bg-purple-100/50 dark:bg-purple-900/20 rounded-xl">
                    <Timer className="size-5 text-purple-500" />
                    <div className="flex-1">
                        <p className="text-xs font-medium text-purple-700 dark:text-purple-300">
                            Delay
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            {getDisplayText()}
                        </p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                        <Label className="text-xs">Duration</Label>
                        <Input
                            type="number"
                            min={1}
                            value={duration}
                            onChange={(e) => setDuration(Number(e.target.value))}
                            className="h-9 rounded-xl text-xs"
                        />
                    </div>
                    <div className="flex-1 space-y-1">
                        <Label className="text-xs">Unit</Label>
                        <Select value={unit} onValueChange={(v) => setUnit(v as 'seconds' | 'minutes' | 'hours' | 'days')}>
                            <SelectTrigger className="h-9 rounded-xl text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="seconds">Seconds</SelectItem>
                                <SelectItem value="minutes">Minutes</SelectItem>
                                <SelectItem value="hours">Hours</SelectItem>
                                <SelectItem value="days">Days</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Input handle */}
            <NodeHandle
                type="target"
                position={Position.Left}
                nodeType="logicDelay"
            />

            {/* Output handle */}
            <NodeHandle
                type="source"
                position={Position.Right}
                nodeType="logicDelay"
            />
        </NodeShell>
    );
}

export default memo(DelayNode);
