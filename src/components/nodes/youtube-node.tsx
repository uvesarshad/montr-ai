
'use client';

import React, { useCallback, memo, useState, useEffect } from 'react';
import { Position, NodeProps } from 'reactflow';
import { CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import NodeShell, { NodeActionInput, NodePreviewCard } from './node-shell';
import { Youtube, Loader2 } from 'lucide-react';
import { transcribeVideo } from '@/ai/flows/transcribe-video-flow';
import { getPageMetadata } from '@/ai/flows/get-page-metadata-flow';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import { validateSocialUrl, extractYouTubeId } from '@/lib/url-validators';
import Image from 'next/image';
import NodeHandle from './node-handle';

const YouTubeNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { toast } = useToast();
  const { updateNodeData, deleteNode, propagateToOutgoers } = useNodeUtils(id);

  const [isLoading, setIsLoading] = useState(false);
  const [isMetadataLoading, setIsMetadataLoading] = useState(false);
  const [urlInput, setUrlInput] = useState(data.url || '');

  useEffect(() => {
    if (data.transcript) {
      propagateToOutgoers(data.transcript);
    }
  }, [data.transcript, propagateToOutgoers]);

  const processVideo = useCallback(async (url: string) => {
    if (!url) return;

    const validation = validateSocialUrl(url, 'youtube');
    if (!validation.isValid) {
      toast({ variant: "destructive", title: "Invalid URL", description: validation.error || "Please enter a valid YouTube video URL." });
      return;
    }

    const videoId = extractYouTubeId(url);
    if (!videoId) {
      toast({ variant: "destructive", title: "Invalid URL", description: "Could not extract video ID from URL." });
      return;
    }

    setIsLoading(true);
    setIsMetadataLoading(true);
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/0.jpg`;
    updateNodeData({ url, thumbnailUrl, title: 'Loading...', description: '' });

    const metadataPromise = getPageMetadata({ url });
    const transcriptionPromise = transcribeVideo({ youtubeUrl: url });

    metadataPromise.then(metadataResult => {
      if (metadataResult) {
        updateNodeData({
          title: metadataResult.title || 'No Title Found',
          description: metadataResult.description || '',
        });
      }
    }).catch(error => {
      console.error('Failed to fetch page metadata:', error);
      toast({ variant: "destructive", title: "Metadata Error", description: "Could not fetch video details." });
      updateNodeData({ title: 'Metadata Failed', description: '' });
    }).finally(() => {
      setIsMetadataLoading(false);
    });

    transcriptionPromise.then(({ transcript }) => {
      updateNodeData({ transcript });
      toast({ title: "Video transcribed!", description: "The video transcript has been successfully generated." });
      propagateToOutgoers(transcript);
    }).catch(e => {
      console.error("Error processing video:", e);
      toast({ variant: "destructive", title: "Transcription Error", description: e.message || "An unexpected error occurred." });
      updateNodeData({ title: data.title || "Transcription Failed" });
    }).finally(() => {
      setIsLoading(false);
    });

  }, [updateNodeData, toast, propagateToOutgoers, data.title]);


  const handleAddClick = useCallback(() => {
    processVideo(urlInput);
  }, [processVideo, urlInput]);

  const totalLoading = isLoading || isMetadataLoading;

  return (
    <NodeShell
      id={id}
      nodeType="youtubeNode"
      selected={selected}
      onDelete={deleteNode}
      minWidth={320}
      contentClassName="p-2 relative"
      title="YouTube"
      icon={<Youtube className="h-full w-full" />}
    >
      <div className="nodrag">
        {!data.url && (
          <NodeActionInput
            id={`url-input-${id}`}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddClick(); }}
            onClick={handleAddClick}
            isLoading={totalLoading}
            placeholder="Enter YouTube URL"
            buttonLabel="Add"
          />
        )}

        {data.url && (
          <>
            <NodePreviewCard>
              {data.thumbnailUrl && (
                <div className="aspect-video w-full relative bg-muted">
                  {isMetadataLoading && !data.thumbnailUrl && <div className="w-full h-full bg-muted animate-pulse" />}
                  {data.thumbnailUrl && <Image src={data.thumbnailUrl} alt={data.title || 'YouTube thumbnail'} layout="fill" objectFit="cover" />}
                </div>
              )}
              <CardHeader className="p-3">
                <CardTitle className="text-sm font-semibold truncate">{data.title || 'YouTube Video'}</CardTitle>
                {data.description && <CardDescription className="text-xs line-clamp-2">{data.description}</CardDescription>}
              </CardHeader>
            </NodePreviewCard>
            {isLoading && !data.transcript && (
              <div className="flex items-center text-xs text-muted-foreground mt-2">
                <Loader2 className="size-3 mr-2 animate-spin" />
                <span>Transcribing video...</span>
              </div>
            )}
          </>
        )}
      </div>

      <NodeHandle type="source" position={Position.Right} nodeType="youtubeNode" isConnectable={isConnectable} id="transcript-output" />
      <NodeHandle type="target" position={Position.Left} nodeType="youtubeNode" isConnectable={isConnectable} />
    </NodeShell>
  );
};

export default memo(YouTubeNode);
