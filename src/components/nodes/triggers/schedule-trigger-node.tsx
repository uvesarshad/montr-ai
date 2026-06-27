'use client';

import React, { memo, useState, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { Calendar } from 'lucide-react';
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

interface ScheduleTriggerData {
    scheduleType?: 'interval' | 'cron';
    interval?: number;
    intervalUnit?: 'minutes' | 'hours' | 'days' | 'weeks';
    cronExpression?: string;
}

const PRESET_SCHEDULES = [
    { label: 'Every hour', value: '0 * * * *' },
    { label: 'Every day at 9am', value: '0 9 * * *' },
    { label: 'Every Monday at 9am', value: '0 9 * * 1' },
    { label: 'Every month on the 1st', value: '0 0 1 * *' },
];

function ScheduleTriggerNode({ id, data, selected }: NodeProps<ScheduleTriggerData>) {
    const [scheduleType, setScheduleType] = useState<'interval' | 'cron'>(data.scheduleType || 'interval');
    const [interval, setInterval] = useState(data.interval || 1);
    const [intervalUnit, setIntervalUnit] = useState(data.intervalUnit || 'hours');
    const [cronExpression, setCronExpression] = useState(data.cronExpression || '0 9 * * *');

    const handleDelete = useCallback(() => {
        // Will be handled by parent
    }, []);

    return (
        <NodeShell
            id={id}
            nodeType="triggerSchedule"
            selected={selected}
            title="Schedule Trigger"
            icon={<Calendar className="size-3.5" />}
            minWidth={300}
            minHeight={220}
            onDelete={handleDelete}
        >
            <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 p-3 bg-orange-100/50 dark:bg-orange-900/20 rounded-xl">
                    <Calendar className="size-5 text-orange-500" />
                    <div className="flex-1">
                        <p className="text-xs font-medium text-orange-700 dark:text-orange-300">
                            Schedule Trigger
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Run on a schedule
                        </p>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label className="text-xs">Schedule Type</Label>
                        <Select value={scheduleType} onValueChange={(v) => setScheduleType(v as 'interval' | 'cron')}>
                            <SelectTrigger className="h-9 rounded-xl text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="interval">Interval</SelectItem>
                                <SelectItem value="cron">Cron Expression</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {scheduleType === 'interval' ? (
                        <div className="flex gap-2">
                            <div className="flex-1 space-y-1">
                                <Label className="text-xs">Every</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    value={interval}
                                    onChange={(e) => setInterval(Number(e.target.value))}
                                    className="h-9 rounded-xl text-xs"
                                />
                            </div>
                            <div className="flex-1 space-y-1">
                                <Label className="text-xs">Unit</Label>
                                <Select value={intervalUnit} onValueChange={(v) => setIntervalUnit(v as 'minutes' | 'hours' | 'days' | 'weeks')}>
                                    <SelectTrigger className="h-9 rounded-xl text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="minutes">Minutes</SelectItem>
                                        <SelectItem value="hours">Hours</SelectItem>
                                        <SelectItem value="days">Days</SelectItem>
                                        <SelectItem value="weeks">Weeks</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Label className="text-xs">Cron Expression</Label>
                            <Input
                                value={cronExpression}
                                onChange={(e) => setCronExpression(e.target.value)}
                                placeholder="0 9 * * *"
                                className="h-9 rounded-xl text-xs font-mono"
                            />
                            <div className="flex flex-wrap gap-1">
                                {PRESET_SCHEDULES.map((preset) => (
                                    <button
                                        key={preset.value}
                                        onClick={() => setCronExpression(preset.value)}
                                        className="text-[10px] px-2 py-1 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Output handle */}
            <NodeHandle
                type="source"
                position={Position.Right}
                nodeType="triggerSchedule"
            />
        </NodeShell>
    );
}

export default memo(ScheduleTriggerNode);
