
'use client';

import React, { useCallback, memo, useState, useEffect } from 'react';
import { Position, NodeProps } from 'reactflow';
import NodeShell, { NodeActionInput, NodePreviewCard } from './node-shell';
import { Instagram, Loader2, ArrowDownToLine, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import { processInstagramPostWithCredits } from '@/ai/flows';
import { validateSocialUrl, extractInstagramShortcode } from '@/lib/url-validators';
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

type InstagramMode = 'scrape' | 'post';

const InstagramNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { toast } = useToast();
  const { updateNodeData, deleteNode, propagateToOutgoers, getIncomingContent } = useNodeUtils(id);

  const [mode, setMode] = useState<InstagramMode>(data.instagramMode || 'scrape');
  const [urlInput, setUrlInput] = useState(data.url || '');
  const [embedUrl, setEmbedUrl] = useState(data.embedUrl || '');
  const [caption, setCaption] = useState(data.caption || '');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const combinedOutput = [
      data.description ? `Post Description:\n${data.description}` : '',
      data.transcript ? `Audio Transcript:\n${data.transcript}` : '',
    ].filter(Boolean).join('\n\n');

    if (combinedOutput) {
      propagateToOutgoers(combinedOutput, { mode: 'append' });
    }
  }, [data.description, data.transcript, propagateToOutgoers]);


  const handleAddClick = useCallback(async () => {
    const validation = validateSocialUrl(urlInput, 'instagram');

    if (!validation.isValid) {
      toast({ variant: 'destructive', title: 'Invalid URL', description: validation.error || 'Please enter a valid Instagram URL.' });
      return;
    }

    setIsLoading(true);

    // Set embed URL for immediate visual feedback
    try {
      const shortcode = extractInstagramShortcode(urlInput);
      if (shortcode) {
        const constructedEmbedUrl = `https://www.instagram.com/p/${shortcode}/embed`;
        setEmbedUrl(constructedEmbedUrl);
        updateNodeData({ url: urlInput, embedUrl: constructedEmbedUrl, instagramMode: 'scrape' });
      } else {
        throw new Error('Could not find post ID in URL for embed.');
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Embed Error", description: error instanceof Error ? error.message : "Could not construct embeddable URL." });
    }

    // Process for data extraction via Apify
    toast({ title: 'Extracting Post Data...', description: 'Please wait, this may include audio transcription and can take a minute.' });
    try {
      const result = await processInstagramPostWithCredits(urlInput);
      updateNodeData({
        postType: result.postType,
        description: result.description,
        mediaUrls: result.mediaUrls,
        transcript: result.transcript,
      });

      toast({ title: 'Instagram Post Processed', description: 'AI has extracted data from the post.' });

    } catch (error) {
      console.error("Failed to process Instagram post:", error);
      toast({ variant: "destructive", title: "Data Extraction Failed", description: error instanceof Error ? error.message : "Could not get data from the post." });
    } finally {
      setIsLoading(false);
    }

  }, [urlInput, toast, updateNodeData]);

  const handlePost = useCallback(async () => {
    const content = caption || getIncomingContent();
    if (!content) {
      toast({ variant: 'destructive', title: 'No content', description: 'Write a caption or connect a content node.' });
      return;
    }

    setIsLoading(true);
    try {
      updateNodeData({ caption: content, instagramMode: 'post' });
      toast({ title: 'Post configured', description: 'Instagram post ready for execution.' });
    } finally {
      setIsLoading(false);
    }
  }, [caption, getIncomingContent, updateNodeData, toast]);

  return (
    <NodeShell
      id={id}
      nodeType="instagramNode"
      selected={selected}
      onDelete={deleteNode}
      hasAdvanced={true}
      minWidth={320}
      contentClassName="p-2 relative"
      title="Instagram"
      icon={<Instagram className="h-full w-full" />}
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
            {!embedUrl ? (
              <NodeActionInput
                id={`url-input-${id}`}
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddClick(); }}
                onClick={handleAddClick}
                isLoading={isLoading}
                placeholder="Enter Instagram Post URL"
                buttonLabel="Add"
              />
            ) : (
              <NodePreviewCard className="aspect-[4/5] bg-muted">
                <iframe
                  src={`${embedUrl}/captioned`}
                  className="w-full h-full border-0"
                  allowFullScreen
                  scrolling="no"
                  title="Instagram Post"
                ></iframe>
              </NodePreviewCard>
            )}

            {data.transcript && (
              <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
                <p className="font-semibold mb-1">Audio Transcript:</p>
                <p className="line-clamp-3">{data.transcript}</p>
              </div>
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
                  <SelectValue placeholder="Select Instagram account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="connect">Connect Instagram →</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Caption</Label>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write your caption or connect a node..."
                className="min-h-[60px] text-xs resize-none rounded-xl"
                rows={3}
              />
            </div>
            <Button
              size="sm"
              className="w-full h-8 text-xs rounded-xl"
              onClick={handlePost}
              disabled={isLoading}
            >
              <Send className="size-3 mr-1.5" />
              Configure Post
            </Button>
          </div>
        )}
      </div>

      <NodeHandle type="source" position={Position.Right} nodeType="instagramNode" isConnectable={isConnectable} id="data-output" />
      <NodeHandle type="target" position={Position.Left} nodeType="instagramNode" isConnectable={isConnectable} />
    </NodeShell>
  );
};

export default memo(InstagramNode);
