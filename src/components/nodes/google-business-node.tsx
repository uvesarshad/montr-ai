'use client';

import React, { memo, useState, useCallback } from 'react';
import { Position, NodeProps } from 'reactflow';
import { Building2, Star, Send, MessageSquare, Loader2 } from 'lucide-react';
import NodeShell from './node-shell';
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

type GBPMode = 'create_post' | 'read_reviews' | 'reply_review';

interface GoogleBusinessNodeData {
    mode?: GBPMode;
    postContent?: string;
    replyContent?: string;
}

function GoogleBusinessNode({ id, data, isConnectable, selected }: NodeProps<GoogleBusinessNodeData>) {
    const { toast } = useToast();
    const { updateNodeData, deleteNode, getIncomingContent } = useNodeUtils(id);

    const [mode, setMode] = useState<GBPMode>(data.mode || 'create_post');
    const [postContent, setPostContent] = useState(data.postContent || '');
    const [isLoading, setIsLoading] = useState(false);

    const handleAction = useCallback(async () => {
        setIsLoading(true);
        try {
            if (mode === 'create_post') {
                const content = postContent || getIncomingContent();
                updateNodeData({ postContent: content, mode });
                toast({ title: 'Post configured', description: 'Google Business post ready.' });
            } else if (mode === 'read_reviews') {
                updateNodeData({ mode });
                toast({ title: 'Reviews configured', description: 'Will fetch reviews on execution.' });
            } else {
                updateNodeData({ mode, replyContent: postContent });
                toast({ title: 'Reply configured', description: 'Review reply ready on execution.' });
            }
        } finally {
            setIsLoading(false);
        }
    }, [mode, postContent, getIncomingContent, updateNodeData, toast]);

    return (
        <NodeShell
            id={id}
            nodeType="googleBusinessNode"
            selected={selected}
            onDelete={deleteNode}
            hasAdvanced={true}
            minWidth={300}
            contentClassName="p-4 relative"
            title="Google Business"
            icon={<Building2 className="h-full w-full text-blue-500" />}
        >
            <NodeHandle type="target" position={Position.Left} nodeType="googleBusinessNode" isConnectable={isConnectable} />

            <div className="nodrag space-y-4">
                {/* Mode Selector */}
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Mode</Label>
                    <Select value={mode} onValueChange={(v) => setMode(v as GBPMode)}>
                        <SelectTrigger className="h-8 text-xs rounded-xl">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="create_post">
                                <div className="flex items-center gap-1.5">
                                    <Send className="size-3" />
                                    <span>Create Post</span>
                                </div>
                            </SelectItem>
                            <SelectItem value="read_reviews">
                                <div className="flex items-center gap-1.5">
                                    <Star className="size-3" />
                                    <span>Read Reviews</span>
                                </div>
                            </SelectItem>
                            <SelectItem value="reply_review">
                                <div className="flex items-center gap-1.5">
                                    <MessageSquare className="size-3" />
                                    <span>Reply to Review</span>
                                </div>
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Account */}
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Business Account</Label>
                    <Select>
                        <SelectTrigger className="h-8 text-xs rounded-xl">
                            <SelectValue placeholder="Connect account" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="connect">
                                Connect Google Business →
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Content Area */}
                {(mode === 'create_post' || mode === 'reply_review') && (
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                            {mode === 'create_post' ? 'Post Content' : 'Reply Text'}
                        </Label>
                        <Textarea
                            value={postContent}
                            onChange={(e) => setPostContent(e.target.value)}
                            placeholder={mode === 'create_post' ? 'Write a business update...' : 'Write your reply...'}
                            className="min-h-[60px] text-xs resize-none rounded-xl"
                            rows={3}
                        />
                    </div>
                )}

                {mode === 'read_reviews' && (
                    <div className="rounded-xl bg-muted/30 border border-border/40 p-3">
                        <p className="text-xs text-muted-foreground">
                            ⭐ Will fetch recent reviews and pass them to connected nodes.
                        </p>
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

            <NodeHandle type="source" position={Position.Right} nodeType="googleBusinessNode" isConnectable={isConnectable} />
        </NodeShell>
    );
}

export default memo(GoogleBusinessNode);
