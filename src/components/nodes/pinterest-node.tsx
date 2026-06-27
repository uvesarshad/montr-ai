'use client';

import React, { useCallback, memo, useState, useEffect } from 'react';
import { Position, NodeProps } from 'reactflow';
import NodeShell, { NodeActionInput, NodePreviewCard } from './node-shell';
import { CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Loader2, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import { PinterestLogo } from '../social-icons';
import { processPinterestPin } from '@/ai/flows/process-pinterest-flow';
import { validateSocialUrl } from '@/lib/url-validators';
import Image from 'next/image';
import NodeHandle from './node-handle';

const PinterestNode = ({ id, data, isConnectable, selected }: NodeProps) => {
    const { toast } = useToast();
    const { updateNodeData, deleteNode, propagateToOutgoers } = useNodeUtils(id);

    const [urlInput, setUrlInput] = useState(data.url || '');
    const [isLoading, setIsLoading] = useState(false);

    // Propagate the AI prompt when it changes
    useEffect(() => {
        if (data.aiPrompt) {
            propagateToOutgoers(data.aiPrompt);
        }
    }, [data.aiPrompt, propagateToOutgoers]);

    const handleAddClick = useCallback(async () => {
        const validation = validateSocialUrl(urlInput, 'pinterest');

        if (!validation.isValid) {
            toast({
                variant: 'destructive',
                title: 'Invalid URL',
                description: validation.error || 'Please enter a valid Pinterest pin URL.'
            });
            return;
        }

        setIsLoading(true);
        toast({ title: 'Processing Pinterest Pin...', description: 'Extracting design inspiration data.' });

        try {
            const result = await processPinterestPin({ url: urlInput });

            if (!result.success || !result.data) {
                throw new Error(result.error || 'Failed to process Pinterest pin');
            }

            updateNodeData({
                url: urlInput,
                title: result.data.title,
                description: result.data.description,
                imageUrl: result.data.imageUrl,
                pinner: result.data.pinner,
                aiPrompt: result.data.aiPrompt,
            });

            toast({
                title: 'Pinterest Pin Processed',
                description: 'Design inspiration data extracted and ready for AI.'
            });

        } catch (error) {
            console.error('Pinterest processing failed:', error);
            toast({
                variant: 'destructive',
                title: 'Processing Failed',
                description: error instanceof Error ? error.message : 'Could not process the Pinterest pin.'
            });
        } finally {
            setIsLoading(false);
        }
    }, [urlInput, toast, updateNodeData]);

    const hasData = data.url && (data.title || data.imageUrl);

    return (
        <NodeShell
            id={id}
            nodeType="pinterestNode"
            selected={selected}
            onDelete={deleteNode}
            minWidth={320}
            contentClassName="p-2 relative"
            title="Pinterest"
            icon={<PinterestLogo className="h-full w-full" />}
        >
            {isLoading && <Loader2 className="size-4 animate-spin absolute top-4 right-4" />}

            <div className="nodrag">
                {!hasData ? (
                    <NodeActionInput
                        id={`url-input-${id}`}
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddClick(); }}
                        onClick={handleAddClick}
                        isLoading={isLoading}
                        placeholder="Enter Pinterest Pin URL"
                        buttonLabel="Add"
                    />
                ) : (
                    <NodePreviewCard>
                        {data.imageUrl && (
                            <div className="aspect-square w-full relative bg-muted overflow-hidden rounded-t-lg">
                                <Image
                                    src={data.imageUrl}
                                    alt={data.title || 'Pinterest pin'}
                                    fill
                                    className="object-cover"
                                />
                            </div>
                        )}
                        <CardHeader className="p-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <CardTitle className="text-sm font-semibold line-clamp-2">
                                        {data.title || 'Pinterest Pin'}
                                    </CardTitle>
                                    {data.pinner?.name && (
                                        <CardDescription className="text-xs mt-1">
                                            by {data.pinner.name}
                                        </CardDescription>
                                    )}
                                </div>
                                <a
                                    href={data.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                                >
                                    <ExternalLink className="size-4" />
                                </a>
                            </div>
                        </CardHeader>
                        {data.description && (
                            <CardContent className="p-3 pt-0">
                                <p className="text-xs text-muted-foreground line-clamp-3">
                                    {data.description}
                                </p>
                            </CardContent>
                        )}
                    </NodePreviewCard>
                )}
            </div>

            {data.aiPrompt && (
                <div className="mt-2 text-[10px] text-muted-foreground bg-muted/50 rounded-md p-2">
                    <span className="font-medium">AI Ready:</span> Design inspiration extracted
                </div>
            )}

            <NodeHandle type="source" position={Position.Right} nodeType="pinterestNode" isConnectable={isConnectable} id="data-output" />
            <NodeHandle type="target" position={Position.Left} nodeType="pinterestNode" isConnectable={isConnectable} />
        </NodeShell>
    );
};

export default memo(PinterestNode);
