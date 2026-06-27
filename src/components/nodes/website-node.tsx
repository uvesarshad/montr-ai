
'use client';

import React, { useCallback, memo, useState, useEffect } from 'react';
import { Position, NodeProps } from 'reactflow';
import { CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import NodeShell, { NodeActionInput, NodePreviewCard } from './node-shell';
import NodeHandle from './node-handle';
import { Globe, Loader2 } from 'lucide-react';
import { convertUrlToMarkdown, getPageMetadata } from '@/ai/flows';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import { isValidHttpUrl } from '@/lib/url-validators';
import Image from 'next/image';

const WebsiteNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { toast } = useToast();
  const { updateNodeData, deleteNode, propagateToOutgoers } = useNodeUtils(id);

  const [isLoading, setIsLoading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [urlInput, setUrlInput] = useState(data.url || '');

  useEffect(() => {
    if (data.markdownContent) {
      propagateToOutgoers(data.markdownContent);
    }
  }, [data.markdownContent, propagateToOutgoers]);

  const processUrl = useCallback(async (url: string) => {
    if (!url) return;

    if (!isValidHttpUrl(url)) {
      toast({ variant: "destructive", title: "Invalid URL", description: "Please enter a valid HTTP or HTTPS URL." });
      return;
    }

    setIsLoading(true);
    setIsPreviewLoading(true);
    updateNodeData({
      url,
      title: 'Loading...',
      summary: 'Fetching page details...',
      thumbnailUrl: null,
      markdownContent: null
    });

    try {
      const metadataPromise = getPageMetadata({ url });
      const contentPromise = convertUrlToMarkdown({ url });

      metadataPromise.then(metadataResult => {
        if (metadataResult) {
          updateNodeData({
            title: metadataResult.title || 'No Title Found',
            summary: metadataResult.description,
            thumbnailUrl: metadataResult.imageUrl,
          });
        }
      }).catch(error => {
        console.error('Failed to fetch page metadata:', error);
        toast({ variant: "destructive", title: "Preview Error", description: "Could not fetch page preview." });
        updateNodeData({ title: 'Preview Failed', summary: 'Could not load page details.' });
      }).finally(() => {
        setIsPreviewLoading(false);
      });

      contentPromise.then(contentResult => {
        if (contentResult) {
          updateNodeData({
            markdownContent: contentResult.markdownContent,
          });
          toast({ title: "Website content fetched!", description: `Successfully processed ${url}` });
          if (contentResult.markdownContent) {
            propagateToOutgoers(contentResult.markdownContent);
          }
        }
      }).catch(error => {
        console.error('Failed to convert URL to markdown:', error);
        toast({ variant: "destructive", title: "Content Error", description: error.message || "Could not fetch website content." });
        updateNodeData({ markdownContent: '# Error: Could not fetch content' });
      }).finally(() => {
        setIsLoading(false);
      });

    } catch (e) {
      console.error("Error processing URL:", e);
      toast({ variant: "destructive", title: "Processing Error", description: "An unexpected error occurred." });
      setIsLoading(false);
      setIsPreviewLoading(false);
    }
  }, [updateNodeData, toast, propagateToOutgoers]);


  const handleAddClick = useCallback(() => {
    processUrl(urlInput);
  }, [processUrl, urlInput]);

  return (
    <NodeShell
      id={id}
      nodeType="websiteNode"
      selected={selected}
      onDelete={deleteNode}
      hasAdvanced={true}
      minWidth={320}
      contentClassName="p-2 relative"
      title="Website"
      icon={<Globe className="h-full w-full" />}
    >
      <div className="nodrag">
        {(!data.url || !data.title) && (
          <NodeActionInput
            id={`url-input-${id}`}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddClick(); }}
            onClick={handleAddClick}
            isLoading={isLoading || isPreviewLoading}
            placeholder="Enter URL"
          />
        )}

        {data.title && (
          <>
            <NodePreviewCard>
              {data.thumbnailUrl ? (
                <div className="aspect-video w-full relative bg-muted">
                  <Image src={data.thumbnailUrl} alt={data.title} layout="fill" objectFit="cover" />
                </div>
              ) : (
                isPreviewLoading && <div className="aspect-video w-full bg-muted animate-pulse" />
              )}
              <CardHeader className="p-3">
                <CardTitle className="text-sm font-semibold truncate">{data.title}</CardTitle>
                {data.summary && <CardDescription className="text-xs line-clamp-2">{data.summary}</CardDescription>}
              </CardHeader>
            </NodePreviewCard>
            {isLoading && !data.markdownContent && (
              <div className="flex items-center text-xs text-muted-foreground mt-2">
                <Loader2 className="size-3 mr-2 animate-spin" />
                <span>Processing content...</span>
              </div>
            )}
          </>
        )}
      </div>

      <NodeHandle type="source" position={Position.Right} nodeType="websiteNode" isConnectable={isConnectable} id="markdown-output" />
      <NodeHandle type="target" position={Position.Left} nodeType="websiteNode" isConnectable={isConnectable} />
    </NodeShell>
  );
};

export default memo(WebsiteNode);
