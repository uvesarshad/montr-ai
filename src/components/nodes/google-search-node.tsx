'use client';

import React, { memo, useState, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { Search, Globe, Zap, Loader2 } from 'lucide-react';
import NodeShell from './node-shell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import NodeHandle from './node-handle';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface GoogleSearchData {
    query?: string;
    provider?: 'brave' | 'perplexity';
    searchType?: 'web' | 'news' | 'images';
    resultCount?: number;
    results?: string;
}

function GoogleSearchNode({ id, data, isConnectable, selected }: NodeProps<GoogleSearchData>) {
    const { toast } = useToast();
    const { updateNodeData, deleteNode, getIncomingContent } = useNodeUtils(id);

    const [query, setQuery] = useState(data.query || '');
    const [provider, setProvider] = useState<string>(data.provider || 'brave');
    const [searchType, setSearchType] = useState<string>(data.searchType || 'web');
    const [isLoading, setIsLoading] = useState(false);

    const handleSearch = useCallback(async () => {
        const searchQuery = query || getIncomingContent();
        if (!searchQuery) {
            toast({ variant: 'destructive', title: 'No query', description: 'Please enter a search query or connect an input node.' });
            return;
        }

        setIsLoading(true);
        try {
            // TODO: Wire to /api/search endpoint (Brave API / Perplexity)
            // For now, store the query and show the configuration
            updateNodeData({
                query: searchQuery,
                provider,
                searchType,
                results: `[Search pending] Query: "${searchQuery}" via ${provider} (${searchType})`
            });

            toast({ title: 'Search configured', description: `Query "${searchQuery}" ready for execution.` });
        } catch (error) {
            console.error('Search error:', error);
            toast({ variant: 'destructive', title: 'Search failed', description: 'Could not perform the search.' });
        } finally {
            setIsLoading(false);
        }
    }, [query, provider, searchType, getIncomingContent, updateNodeData, toast]);

    return (
        <NodeShell
            id={id}
            nodeType="googleSearchNode"
            selected={selected}
            onDelete={deleteNode}
            hasAdvanced={true}
            minWidth={320}
            contentClassName="p-4 relative"
            title="Google Search"
            icon={<Search className="h-full w-full" />}
        >
            <NodeHandle type="target" position={Position.Left} nodeType="googleSearchNode" isConnectable={isConnectable} />

            <div className="nodrag space-y-4">
                {/* Provider & Type */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Provider</Label>
                        <Select value={provider} onValueChange={setProvider}>
                            <SelectTrigger className="h-8 text-xs rounded-xl">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="brave">
                                    <div className="flex items-center gap-1.5">
                                        <Globe className="size-3" />
                                        <span>Brave Search</span>
                                    </div>
                                </SelectItem>
                                <SelectItem value="perplexity">
                                    <div className="flex items-center gap-1.5">
                                        <Zap className="size-3" />
                                        <span>Perplexity AI</span>
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Type</Label>
                        <Select value={searchType} onValueChange={setSearchType}>
                            <SelectTrigger className="h-8 text-xs rounded-xl">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="web">Web</SelectItem>
                                <SelectItem value="news">News</SelectItem>
                                <SelectItem value="images">Images</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Search Query */}
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Search Query</Label>
                    <div className="flex gap-2">
                        <Input
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                updateNodeData({ query: e.target.value });
                            }}
                            placeholder="Search for..."
                            className="h-9 rounded-xl text-xs flex-1"
                        />
                        <Button
                            size="sm"
                            className="h-9 rounded-xl"
                            onClick={handleSearch}
                            disabled={isLoading}
                        >
                            {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                        </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                        Accepts input from connected nodes via {'{{variables}}'}
                    </p>
                </div>

                {/* Results Preview */}
                {data.results && (
                    <div className="rounded-xl bg-muted/30 border border-border/40 p-3 max-h-32 overflow-y-auto">
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                            {data.results.slice(0, 300)}
                            {(data.results?.length ?? 0) > 300 && '...'}
                        </p>
                    </div>
                )}
            </div>

            <NodeHandle type="source" position={Position.Right} nodeType="googleSearchNode" isConnectable={isConnectable} />
        </NodeShell>
    );
}

export default memo(GoogleSearchNode);
