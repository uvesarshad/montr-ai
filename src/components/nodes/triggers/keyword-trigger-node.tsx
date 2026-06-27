'use client';

import React, { memo, useState, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { Search, Eye } from 'lucide-react';
import NodeShell from '../node-shell';
import NodeHandle from '../node-handle';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface KeywordTriggerData {
    keywords?: string[];
    sources?: ('web' | 'social' | 'news')[];
    checkFrequency?: string;
}

function KeywordTriggerNode({ id, data, selected }: NodeProps<KeywordTriggerData>) {
    const [keywords, setKeywords] = useState<string[]>(data.keywords || []);
    const [keywordInput, setKeywordInput] = useState('');
    const [checkFrequency, setCheckFrequency] = useState(data.checkFrequency || '1h');
    const [sources, setSources] = useState<string[]>(data.sources || ['web', 'social']);

    const handleDelete = useCallback(() => {
        // Handled by parent
    }, []);

    const addKeyword = () => {
        const kw = keywordInput.trim();
        if (kw && !keywords.includes(kw)) {
            setKeywords([...keywords, kw]);
            setKeywordInput('');
        }
    };

    const removeKeyword = (kw: string) => {
        setKeywords(keywords.filter(k => k !== kw));
    };

    const toggleSource = (source: string) => {
        setSources(prev =>
            prev.includes(source)
                ? prev.filter(s => s !== source)
                : [...prev, source]
        );
    };

    return (
        <NodeShell
            id={id}
            nodeType="triggerKeyword"
            selected={selected}
            title="Keyword Trigger"
            icon={<Search className="size-3.5" />}
            minWidth={300}
            minHeight={280}
            hasAdvanced={true}
            onDelete={handleDelete}
        >
            <div className="p-4 space-y-4">
                <div className="flex items-center gap-2 p-3 bg-amber-100/50 dark:bg-amber-900/20 rounded-xl">
                    <Eye className="size-5 text-amber-500" />
                    <div className="flex-1">
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                            Keyword Monitor
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                            Triggers when tracked keywords are detected
                        </p>
                    </div>
                </div>

                <div className="space-y-3">
                    {/* Keywords */}
                    <div className="space-y-2">
                        <Label className="text-xs">Track Keywords</Label>
                        <div className="flex gap-2">
                            <Input
                                value={keywordInput}
                                onChange={(e) => setKeywordInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                                placeholder="Add a keyword..."
                                className="h-9 rounded-xl text-xs flex-1"
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-9 rounded-xl text-xs"
                                onClick={addKeyword}
                                disabled={!keywordInput.trim()}
                            >
                                Add
                            </Button>
                        </div>
                        {keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {keywords.map(kw => (
                                    <Badge key={kw} variant="secondary" className="text-xs gap-1 pr-1">
                                        {kw}
                                        <button
                                            onClick={() => removeKeyword(kw)}
                                            className="ml-0.5 hover:text-destructive"
                                        >
                                            <X className="size-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Sources */}
                    <div className="space-y-2">
                        <Label className="text-xs">Monitor Sources</Label>
                        <div className="flex gap-2">
                            {['web', 'social', 'news'].map(source => (
                                <Button
                                    key={source}
                                    variant={sources.includes(source) ? 'default' : 'outline'}
                                    size="sm"
                                    className="text-xs rounded-full h-7 px-3 capitalize"
                                    onClick={() => toggleSource(source)}
                                >
                                    {source}
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Check Frequency */}
                    <div className="space-y-2">
                        <Label className="text-xs">Check Frequency</Label>
                        <Select value={checkFrequency} onValueChange={setCheckFrequency}>
                            <SelectTrigger className="h-9 rounded-xl text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="15m">Every 15 minutes</SelectItem>
                                <SelectItem value="30m">Every 30 minutes</SelectItem>
                                <SelectItem value="1h">Every hour</SelectItem>
                                <SelectItem value="6h">Every 6 hours</SelectItem>
                                <SelectItem value="24h">Daily</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Output info */}
                <div className="rounded-lg bg-muted/30 p-2">
                    <p className="text-[10px] text-muted-foreground">
                        <span className="font-medium">Outputs:</span> matched keyword, source URL, context text, timestamp
                    </p>
                </div>
            </div>

            {/* Output handle */}
            <NodeHandle
                type="source"
                position={Position.Right}
                nodeType="triggerKeyword"
            />
        </NodeShell>
    );
}

export default memo(KeywordTriggerNode);
