'use client';

import React, { memo, useState, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { Bell, AtSign } from 'lucide-react';
import NodeShell from '../node-shell';
import NodeHandle from '../node-handle';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type Platform = 'instagram' | 'linkedin' | 'x' | 'facebook';
type EventType = 'mention' | 'comment' | 'dm' | 'follower' | 'like';

interface SocialTriggerData {
    platforms?: Platform[];
    eventType?: EventType;
}

const PLATFORM_OPTIONS: { id: Platform; name: string; color: string }[] = [
    { id: 'instagram', name: 'Instagram', color: 'bg-pink-500' },
    { id: 'linkedin', name: 'LinkedIn', color: 'bg-blue-600' },
    { id: 'x', name: 'X', color: 'bg-neutral-800 dark:bg-neutral-200' },
    { id: 'facebook', name: 'Facebook', color: 'bg-blue-500' },
];

const EVENT_OPTIONS: { value: EventType; label: string; description: string }[] = [
    { value: 'mention', label: 'New Mention', description: 'When someone mentions your brand' },
    { value: 'comment', label: 'New Comment', description: 'When someone comments on your post' },
    { value: 'dm', label: 'New DM', description: 'When you receive a direct message' },
    { value: 'follower', label: 'New Follower', description: 'When someone follows your account' },
    { value: 'like', label: 'New Like', description: 'When someone likes your post' },
];

function SocialTriggerNode({ id, data, selected }: NodeProps<SocialTriggerData>) {
    const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(data.platforms || []);
    const [eventType, setEventType] = useState<string>(data.eventType || 'mention');

    const handleDelete = useCallback(() => {
        // Handled by parent
    }, []);

    const togglePlatform = (platform: Platform) => {
        setSelectedPlatforms(prev =>
            prev.includes(platform)
                ? prev.filter(p => p !== platform)
                : [...prev, platform]
        );
    };

    return (
        <NodeShell
            id={id}
            nodeType="triggerSocial"
            selected={selected}
            title="Social Trigger"
            icon={<AtSign className="size-3.5" />}
            minWidth={300}
            minHeight={260}
            hasAdvanced={true}
            onDelete={handleDelete}
        >
            <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 p-3 bg-purple-100/50 dark:bg-purple-900/20 rounded-xl">
                    <Bell className="size-5 text-purple-500" />
                    <div className="flex-1">
                        <p className="text-xs font-medium text-purple-700 dark:text-purple-300">
                            Social Media Trigger
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Triggers on social media events
                        </p>
                    </div>
                </div>

                <div className="space-y-3">
                    {/* Platform Selector */}
                    <div className="space-y-2">
                        <Label className="text-xs">Platforms</Label>
                        <div className="flex gap-2 flex-wrap">
                            {PLATFORM_OPTIONS.map(({ id: pid, name, color }) => (
                                <Button
                                    key={pid}
                                    variant={selectedPlatforms.includes(pid) ? 'default' : 'outline'}
                                    size="sm"
                                    className={cn(
                                        'text-xs rounded-full h-7 px-3',
                                        selectedPlatforms.includes(pid) && color
                                    )}
                                    onClick={() => togglePlatform(pid)}
                                >
                                    {name}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Event Type */}
                    <div className="space-y-2">
                        <Label className="text-xs">Event Type</Label>
                        <Select value={eventType} onValueChange={setEventType}>
                            <SelectTrigger className="h-9 rounded-xl text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {EVENT_OPTIONS.map(({ value, label, description }) => (
                                    <SelectItem key={value} value={value}>
                                        <div>
                                            <span className="font-medium">{label}</span>
                                            <span className="text-muted-foreground ml-1">— {description}</span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Output info */}
                <div className="rounded-lg bg-muted/30 p-2">
                    <p className="text-[10px] text-muted-foreground">
                        <span className="font-medium">Outputs:</span> platform, event type, content, author, timestamp
                    </p>
                </div>
            </div>

            {/* Output handle */}
            <NodeHandle
                type="source"
                position={Position.Right}
                nodeType="triggerSocial"
            />
        </NodeShell>
    );
}

export default memo(SocialTriggerNode);
