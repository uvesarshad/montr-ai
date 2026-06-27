
'use client';

import React, { useCallback, memo, useState, useEffect } from 'react';
import { Position, NodeProps } from 'reactflow';
import NodeShell, { NodeActionInput, NodePreviewCard } from './node-shell';
import { Loader2, ArrowDownToLine, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import { XLogo } from '../social-icons';
import { Tweet } from 'react-tweet';
import { getTweetData } from '@/ai/flows/get-tweet-data-flow';
import { extractTweetId } from '@/lib/url-validators';
import NodeHandle from './node-handle';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type XMode = 'scrape' | 'post';

const XNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { toast } = useToast();
  const { updateNodeData, deleteNode, propagateToOutgoers, getIncomingContent } = useNodeUtils(id);

  const [mode, setMode] = useState<XMode>(data.xMode || 'scrape');
  const [urlInput, setUrlInput] = useState(data.url || '');
  const [embedId, setEmbedId] = useState(data.embedId || '');
  const [tweetText, setTweetText] = useState(data.tweetCompose || '');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (data.tweetText) {
      propagateToOutgoers(`Tweet content:\n${data.tweetText}`, { mode: 'append' });
    }
  }, [data.tweetText, propagateToOutgoers]);

  const handleAddClick = useCallback(async () => {
    const tweetId = extractTweetId(urlInput);

    if (!tweetId) {
      toast({ variant: 'destructive', title: 'Invalid URL', description: 'Please enter a valid X (Twitter) post URL.' });
      return;
    }

    setIsLoading(true);
    setEmbedId(tweetId);
    updateNodeData({ url: urlInput, embedId: tweetId, tweetText: null, mediaUrls: null, xMode: 'scrape' });
    toast({ title: 'Fetching Tweet...', description: 'Embedding post and extracting data.' });

    try {
      const tweetData = await getTweetData({ tweetId });

      if (tweetData.text) {
        updateNodeData({
          tweetText: tweetData.text,
          mediaUrls: tweetData.mediaUrls || [],
        });
        toast({ title: 'Data Extracted', description: 'Successfully fetched tweet content.' });
      } else {
        toast({ variant: 'destructive', title: 'Extraction Failed', description: 'Could not retrieve data for this tweet.' });
      }

    } catch (error) {
      console.error("Failed to fetch tweet data:", error);
      toast({ variant: 'destructive', title: 'Error', description: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsLoading(false);
    }

  }, [urlInput, toast, updateNodeData]);

  const handlePost = useCallback(async () => {
    const content = tweetText || getIncomingContent();
    if (!content) {
      toast({ variant: 'destructive', title: 'No content', description: 'Write a tweet or connect a content node.' });
      return;
    }

    setIsLoading(true);
    try {
      updateNodeData({ tweetCompose: content, xMode: 'post' });
      toast({ title: 'Tweet configured', description: 'Tweet ready for posting on execution.' });
    } finally {
      setIsLoading(false);
    }
  }, [tweetText, getIncomingContent, updateNodeData, toast]);

  const charCount = tweetText.length;
  const charLimit = 280;

  return (
    <NodeShell
      id={id}
      nodeType="xNode"
      selected={selected}
      onDelete={deleteNode}
      hasAdvanced={true}
      minWidth={320}
      contentClassName="p-2 relative"
      title="X (Twitter)"
      icon={<XLogo className="h-full w-full" />}
    >
      {isLoading && <Loader2 className="size-4 animate-spin absolute top-4 right-4 z-10" />}

      <div className="nodrag space-y-3 p-1">
        {/* Mode Toggle */}
        <div className="flex bg-muted/30 p-0.5 rounded-xl">
          <button
            type="button"
            className={cn(
              'flex-1 text-[10px] font-medium py-1.5 rounded-lg transition-all flex items-center justify-center gap-1',
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
              'flex-1 text-[10px] font-medium py-1.5 rounded-lg transition-all flex items-center justify-center gap-1',
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

        {/* Scrape Mode */}
        {mode === 'scrape' && (
          <>
            {!embedId ? (
              <NodeActionInput
                id={`url-input-${id}`}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddClick(); }}
                onClick={handleAddClick}
                isLoading={isLoading}
                placeholder="Enter X (Twitter) Post URL"
                buttonLabel="Add"
              />
            ) : (
              <NodePreviewCard className="min-h-[100px] tweet-container">
                <Tweet id={embedId} />
              </NodePreviewCard>
            )}
          </>
        )}

        {/* Post Mode */}
        {mode === 'post' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Account</Label>
              <Select>
                <SelectTrigger className="h-8 text-xs rounded-xl">
                  <SelectValue placeholder="Select X account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="connect">Connect X (Twitter) →</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label className="text-xs text-muted-foreground">Compose Tweet</Label>
                <span className={cn(
                  "text-[10px]",
                  charCount > charLimit ? "text-destructive" : "text-muted-foreground"
                )}>
                  {charCount}/{charLimit}
                </span>
              </div>
              <Textarea
                value={tweetText}
                onChange={(e) => setTweetText(e.target.value)}
                placeholder="What's happening?"
                className="min-h-[60px] text-xs resize-none rounded-xl"
                rows={3}
                maxLength={charLimit}
              />
            </div>
            <Button
              size="sm"
              className="w-full h-8 text-xs rounded-xl"
              onClick={handlePost}
              disabled={isLoading || charCount > charLimit}
            >
              <Send className="size-3 mr-1.5" />
              Configure Tweet
            </Button>
          </div>
        )}
      </div>

      <NodeHandle type="source" position={Position.Right} nodeType="xNode" isConnectable={isConnectable} id="data-output" />
      <NodeHandle type="target" position={Position.Left} nodeType="xNode" isConnectable={isConnectable} />

    </NodeShell>
  );
};

export default memo(XNode);
