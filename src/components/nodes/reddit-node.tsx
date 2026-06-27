
'use client';

import React, { useCallback, memo, useState, useEffect } from 'react';
import { Position, NodeProps } from 'reactflow';
import { CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import NodeShell, { NodeActionInput, NodePreviewCard } from './node-shell';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import { RedditLogo } from '../social-icons';
import { fetchRedditPost } from '@/lib/reddit-service';
import { validateSocialUrl } from '@/lib/url-validators';
import NodeHandle from './node-handle';

const RedditNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { toast } = useToast();
  const { updateNodeData, deleteNode, propagateToOutgoers } = useNodeUtils(id);

  const [urlInput, setUrlInput] = useState(data.url || '');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const hasContent = data.title || data.content;
    if (hasContent) {
      const fullText = `Reddit Post\nTitle: ${data.title}\nAuthor: ${data.author}\nSubreddit: ${data.subreddit}\n\n${data.content}`;
      propagateToOutgoers(fullText);
    }
  }, [data.title, data.content, data.author, data.subreddit, propagateToOutgoers]);


  const handleAddClick = useCallback(async () => {
    const validation = validateSocialUrl(urlInput, 'reddit');

    if (!validation.isValid) {
      toast({ variant: 'destructive', title: 'Invalid URL', description: validation.error || 'Please enter a valid Reddit post URL.' });
      return;
    }

    setIsLoading(true);
    updateNodeData({ url: urlInput, title: "Processing Reddit post...", author: '', subreddit: '', content: '' });

    try {
      const result = await fetchRedditPost(urlInput);
      updateNodeData({ ...result });
      toast({ title: 'Reddit Post Fetched', description: 'Successfully fetched post data.' });
    } catch (error) {
      console.error("Failed to process Reddit post:", error);
      toast({ variant: "destructive", title: "Processing Failed", description: error instanceof Error ? error.message : "Could not get data from the Reddit post." });
      updateNodeData({ url: '', title: "Failed to load post" });
    } finally {
      setIsLoading(false);
    }

  }, [urlInput, toast, updateNodeData]);

  const hasContent = data.title && data.title !== 'Processing Reddit post...' && data.title !== "Failed to load post";

  return (
    <NodeShell
      id={id}
      nodeType="redditNode"
      selected={selected}
      onDelete={deleteNode}
      minWidth={320}
      contentClassName="p-2 relative"
      title="Reddit"
      icon={<RedditLogo className="h-full w-full" />}
    >
      {isLoading && <Loader2 className="size-4 animate-spin absolute top-4 right-4" />}

      <div className="nodrag">
        {!data.url || !hasContent ? (
          <div>
            <NodeActionInput
              id={`url-input-${id}`}
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddClick(); }}
              onClick={handleAddClick}
              isLoading={isLoading}
              placeholder="Enter Reddit Post URL"
              buttonLabel="Add"
            />
            {data.url && !hasContent && (
              <p className="text-xs text-destructive mt-1 px-1">{data.title || "Ready to process"}</p>
            )}
          </div>
        ) : (
          <>
            {hasContent && (
              <NodePreviewCard>
                <CardHeader className="p-3">
                  <a href={data.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    <CardTitle className="text-sm">{data.title}</CardTitle>
                  </a>
                  <CardDescription className="text-xs">
                    by u/{data.author} in r/{data.subreddit}
                  </CardDescription>
                </CardHeader>
                {data.content && (
                  <CardContent className="p-3 pt-0">
                    <p className="text-xs text-muted-foreground line-clamp-4">
                      {data.content}
                    </p>
                  </CardContent>
                )}
              </NodePreviewCard>
            )}
          </>
        )}
      </div>

      <NodeHandle type="source" position={Position.Right} nodeType="redditNode" isConnectable={isConnectable} id="data-output" />
      <NodeHandle type="target" position={Position.Left} nodeType="redditNode" isConnectable={isConnectable} />
    </NodeShell>
  );
};

export default memo(RedditNode);
