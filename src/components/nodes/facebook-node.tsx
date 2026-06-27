'use client';

import React, { memo, useState, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { Facebook, Send, ArrowDownToLine, Loader2 } from 'lucide-react';
import NodeShell from './node-shell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { cn } from '@/lib/utils';

type FacebookMode = 'scrape' | 'post';

interface FacebookNodeData {
    mode?: FacebookMode;
    url?: string;
    caption?: string;
    pageId?: string;
    scrapedContent?: string;
}

function FacebookNode({ id, data, isConnectable, selected }: NodeProps<FacebookNodeData>) {
    const { toast } = useToast();
    const { updateNodeData, deleteNode, getIncomingContent } = useNodeUtils(id);

    const [mode, setMode] = useState<FacebookMode>(data.mode || 'scrape');
    const [url, setUrl] = useState(data.url || '');
    const [caption, setCaption] = useState(data.caption || '');
    const [isLoading, setIsLoading] = useState(false);

    const handleAction = useCallback(async () => {
        setIsLoading(true);
        try {
            if (mode === 'scrape') {
                if (!url) {
                    toast({ variant: 'destructive', title: 'Missing URL', description: 'Enter a Facebook post URL to scrape.' });
                    return;
                }
                // TODO: Wire to Apify / Facebook Graph API
                updateNodeData({ url, mode, scrapedContent: `[Scrape pending] ${url}` });
                toast({ title: 'URL saved', description: 'Facebook scraping configured.' });
            } else {
                const content = caption || getIncomingContent();
                if (!content) {
                    toast({ variant: 'destructive', title: 'No content', description: 'Write a caption or connect a content node.' });
                    return;
                }
                // TODO: Wire to /api/social/oauth/facebook post endpoint
                updateNodeData({ caption: content, mode });
                toast({ title: 'Post configured', description: 'Facebook post ready for execution.' });
            }
        } catch (_error) {
            toast({ variant: 'destructive', title: 'Error', description: 'Operation failed.' });
        } finally {
            setIsLoading(false);
        }
    }, [mode, url, caption, getIncomingContent, updateNodeData, toast]);

    return (
        <NodeShell
            id={id}
            nodeType="facebookNode"
            selected={selected}
            onDelete={deleteNode}
            hasAdvanced={true}
            minWidth={300}
            contentClassName="p-4 relative"
            title="Facebook"
            icon={<Facebook className="h-full w-full text-blue-600" />}
        >
            <NodeHandle type="target" position={Position.Left} nodeType="facebookNode" isConnectable={isConnectable} />

            <div className="nodrag space-y-4">
                {/* Mode Toggle */}
                <div className="flex bg-muted/30 p-0.5 rounded-xl">
                    <button
                        type="button"
                        className={cn(
                            'flex-1 text-xs font-medium py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5',
                            mode === 'scrape'
                                ? 'bg-background shadow-sm text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                        onClick={() => setMode('scrape')}
                    >
                        <ArrowDownToLine className="size-3" />
                        Scrape
                    </button>
                    <button
                        type="button"
                        className={cn(
                            'flex-1 text-xs font-medium py-1.5 rounded-lg transition-all flex items-center justify-center gap-1.5',
                            mode === 'post'
                                ? 'bg-background shadow-sm text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                        onClick={() => setMode('post')}
                    >
                        <Send className="size-3" />
                        Post
                    </button>
                </div>

                {mode === 'scrape' ? (
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Facebook Post URL</Label>
                            <Input
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://facebook.com/..."
                                className="h-9 rounded-xl text-xs"
                            />
                        </div>
                        <Button
                            size="sm"
                            className="w-full h-8 text-xs rounded-xl"
                            onClick={handleAction}
                            disabled={isLoading || !url}
                        >
                            {isLoading ? <Loader2 className="size-3 animate-spin mr-1.5" /> : <ArrowDownToLine className="size-3 mr-1.5" />}
                            Scrape Post
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Page</Label>
                            <Select>
                                <SelectTrigger className="h-8 text-xs rounded-xl">
                                    <SelectValue placeholder="Select a connected page" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="connect">
                                        Connect Facebook Page →
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs">Caption</Label>
                            <Textarea
                                value={caption}
                                onChange={(e) => setCaption(e.target.value)}
                                placeholder="Write your post or connect a node..."
                                className="min-h-[60px] text-xs resize-none rounded-xl"
                                rows={3}
                            />
                        </div>
                        <Button
                            size="sm"
                            className="w-full h-8 text-xs rounded-xl"
                            onClick={handleAction}
                            disabled={isLoading}
                        >
                            {isLoading ? <Loader2 className="size-3 animate-spin mr-1.5" /> : <Send className="size-3 mr-1.5" />}
                            Configure Post
                        </Button>
                    </div>
                )}
            </div>

            <NodeHandle type="source" position={Position.Right} nodeType="facebookNode" isConnectable={isConnectable} />
        </NodeShell>
    );
}

export default memo(FacebookNode);
