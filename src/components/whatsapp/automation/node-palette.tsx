'use client';

import React, { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { getNodesByCategory, NodeDefinition } from '@/lib/whatsapp/automation/node-definitions';
import { cn } from '@/lib/utils';

interface NodePaletteProps {
    onNodeDragStart: (event: React.DragEvent, nodeDefinition: NodeDefinition) => void;
}

export function NodePalette({ onNodeDragStart }: NodePaletteProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const nodesByCategory = getNodesByCategory();

    const filteredCategories = Object.entries(nodesByCategory).reduce(
        (acc, [category, nodes]) => {
            const filtered = nodes.filter(
                (node) =>
                    node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    node.description.toLowerCase().includes(searchQuery.toLowerCase())
            );
            if (filtered.length > 0) {
                acc[category] = filtered;
            }
            return acc;
        },
        {} as Record<string, NodeDefinition[]>
    );

    return (
        <div className="w-80 border-r bg-muted/30 flex flex-col h-full">
            <div className="p-4 border-b bg-background/50">
                <h3 className="font-semibold mb-3">Node Palette</h3>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        placeholder="Search nodes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                    />
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-4 space-y-6">
                    {Object.entries(filteredCategories).map(([category, nodes]) => (
                        <div key={category}>
                            <h4 className="text-sm font-medium mb-3 text-muted-foreground">
                                {category}
                            </h4>
                            <div className="space-y-2">
                                {nodes.map((node) => (
                                    <Card
                                        key={`${node.type}-${node.subType}`}
                                        className={cn(
                                            'p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all',
                                            'border-l-4'
                                        )}
                                        style={{ borderLeftColor: node.color }}
                                        draggable
                                        onDragStart={(e) => onNodeDragStart(e, node)}
                                    >
                                        <div className="flex items-start gap-2">
                                            <span className="text-xl">{node.icon}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm flex items-center gap-2">
                                                    {node.label}
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[10px] px-1 py-0"
                                                        style={{
                                                            borderColor: node.color,
                                                            color: node.color,
                                                        }}
                                                    >
                                                        {node.type}
                                                    </Badge>
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    {node.description}
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    ))}

                    {Object.keys(filteredCategories).length === 0 && (
                        <div className="text-center text-sm text-muted-foreground py-8">
                            No nodes found
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
