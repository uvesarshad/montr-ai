'use client';

import React, { memo, useState, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { FileText, Search, Plus, RefreshCw, Loader2 } from 'lucide-react';
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

type NotionMode = 'search' | 'read' | 'create' | 'update';

interface NotionNodeData {
    mode?: NotionMode;
    query?: string;
    pageId?: string;
    content?: string;
    pageTitle?: string;
}

// Notion Logo SVG component
const NotionLogo = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.56 2.35c-.42-.326-.98-.7-2.055-.606L3.598 2.86c-.466.046-.56.28-.374.466l1.235 1.882zm.793 3.358v13.86c0 .746.373 1.026 1.213.98l14.523-.84c.84-.046.933-.56.933-1.166V6.73c0-.606-.233-.933-.746-.886l-15.177.886c-.56.047-.746.327-.746.84zm14.337.42c.093.42 0 .84-.42.886l-.7.14v10.264c-.606.327-1.166.513-1.632.513-.746 0-.933-.233-1.493-.933l-4.573-7.181v6.948l1.446.327s0 .84-1.166.84l-3.218.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.093-.42.14-1.026.793-1.073l3.451-.233 4.76 7.274v-6.436l-1.213-.14c-.093-.513.28-.886.746-.933l3.217-.186z" />
    </svg>
);

function NotionNode({ id, data, isConnectable, selected }: NodeProps<NotionNodeData>) {
    const { toast } = useToast();
    const { updateNodeData, deleteNode, getIncomingContent } = useNodeUtils(id);

    const [mode, setMode] = useState<NotionMode>(data.mode || 'search');
    const [query, setQuery] = useState(data.query || '');
    const [pageTitle, setPageTitle] = useState(data.pageTitle || '');
    const [content, setContent] = useState(data.content || '');
    const [isLoading, setIsLoading] = useState(false);

    const handleAction = useCallback(async () => {
        setIsLoading(true);
        try {
            if (mode === 'search') {
                // Uses /api/social/notion/search
                updateNodeData({ query, mode });
                toast({ title: 'Search configured', description: 'Will search Notion pages on execution.' });
            } else if (mode === 'read') {
                updateNodeData({ pageId: query, mode });
                toast({ title: 'Read configured', description: 'Will fetch page content on execution.' });
            } else if (mode === 'create') {
                const text = content || getIncomingContent();
                updateNodeData({ pageTitle, content: text, mode });
                toast({ title: 'Create configured', description: 'Will create a new Notion page on execution.' });
            } else {
                const text = content || getIncomingContent();
                updateNodeData({ pageId: query, content: text, mode });
                toast({ title: 'Update configured', description: 'Will update the page on execution.' });
            }
        } finally {
            setIsLoading(false);
        }
    }, [mode, query, content, pageTitle, getIncomingContent, updateNodeData, toast]);

    return (
        <NodeShell
            id={id}
            nodeType="notionNode"
            selected={selected}
            onDelete={deleteNode}
            hasAdvanced={true}
            minWidth={300}
            contentClassName="p-4 relative"
            title="Notion"
            icon={<NotionLogo />}
        >
            <NodeHandle type="target" position={Position.Left} nodeType="notionNode" isConnectable={isConnectable} />

            <div className="nodrag space-y-4">
                {/* Mode */}
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Action</Label>
                    <Select value={mode} onValueChange={(v) => setMode(v as NotionMode)}>
                        <SelectTrigger className="h-8 text-xs rounded-xl">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="search">
                                <div className="flex items-center gap-1.5"><Search className="size-3" /><span>Search Pages</span></div>
                            </SelectItem>
                            <SelectItem value="read">
                                <div className="flex items-center gap-1.5"><FileText className="size-3" /><span>Read Page</span></div>
                            </SelectItem>
                            <SelectItem value="create">
                                <div className="flex items-center gap-1.5"><Plus className="size-3" /><span>Create Page</span></div>
                            </SelectItem>
                            <SelectItem value="update">
                                <div className="flex items-center gap-1.5"><RefreshCw className="size-3" /><span>Update Page</span></div>
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Account */}
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Notion Account</Label>
                    <Select>
                        <SelectTrigger className="h-8 text-xs rounded-xl">
                            <SelectValue placeholder="Connect Notion" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="connect">Connect Notion →</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Mode-Specific UI */}
                {(mode === 'search' || mode === 'read' || mode === 'update') && (
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                            {mode === 'search' ? 'Search Query' : 'Page ID / URL'}
                        </Label>
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={mode === 'search' ? 'Search for pages...' : 'Paste page ID or URL'}
                            className="h-8 text-xs rounded-xl"
                        />
                    </div>
                )}

                {mode === 'create' && (
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Page Title</Label>
                        <Input
                            value={pageTitle}
                            onChange={(e) => setPageTitle(e.target.value)}
                            placeholder="New page title..."
                            className="h-8 text-xs rounded-xl"
                        />
                    </div>
                )}

                {(mode === 'create' || mode === 'update') && (
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Content</Label>
                        <Textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Page content or connect from a node..."
                            className="min-h-[50px] text-xs resize-none rounded-xl"
                            rows={3}
                        />
                    </div>
                )}

                <Button
                    size="sm"
                    className="w-full h-8 text-xs rounded-xl"
                    onClick={handleAction}
                    disabled={isLoading}
                >
                    {isLoading && <Loader2 className="size-3 animate-spin mr-1.5" />}
                    Configure
                </Button>
            </div>

            <NodeHandle type="source" position={Position.Right} nodeType="notionNode" isConnectable={isConnectable} />
        </NodeShell>
    );
}

export default memo(NotionNode);
