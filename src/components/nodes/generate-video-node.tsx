'use client';

import React, { memo, useState, useEffect } from 'react';
import { Position, NodeProps, useReactFlow } from 'reactflow';
import NodeShell, { NodeControlBar } from './node-shell';
import { Textarea } from '@/components/ui/textarea';
import { Video, Loader2, Wand2 } from 'lucide-react';
import { startVideoGeneration, checkVideoOperation } from '@/ai/flows/generate-video-flow';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import { sleep } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ParameterSlider, ParameterGroup } from '@/components/parameters';
import NodeHandle from './node-handle';
import { type ModelOption } from './model-selector';

const aspectRatios = [
  { value: '16:9', label: 'Widescreen (16:9)' },
  { value: '9:16', label: 'Portrait (9:16)' },
];

const stylePresets = [
  { value: 'natural', label: 'Natural' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'dynamic', label: 'Dynamic' },
  { value: 'dramatic', label: 'Dramatic' },
];

const GenerateVideoNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { getNodes, getEdges } = useReactFlow();
  const { toast } = useToast();
  const { updateNodeData, deleteNode, getIncomingContent } = useNodeUtils(id);

  const [prompt, setPrompt] = useState(data.prompt || '');
  const [videoUrl, setVideoUrl] = useState(data.videoUrl || null);
  const [isLoading, setIsLoading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio || '16:9');
  const [duration, setDuration] = useState(data.duration || 5);
  const [stylePreset, setStylePreset] = useState(data.stylePreset || 'natural');

  useEffect(() => {
    const context = getIncomingContent();
    if (context && !prompt.includes(context)) {
      const newPrompt = `${context}\n\n${prompt}`.trim();
      setPrompt(newPrompt);
      updateNodeData({ prompt: newPrompt });
    }
  }, [getEdges, getNodes, getIncomingContent, prompt, updateNodeData]);


  const handleGenerate = async () => {
    if (!data.selectedModel) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select a model first.' });
      return;
    }
    setIsLoading(true);
    setVideoUrl(null);
    updateNodeData({ videoUrl: null });
    toast({
      title: 'Starting Video Generation...',
      description: 'This will take 2-5 minutes. You can continue working.'
    });

    try {
      const context = getIncomingContent();

      // Build enhanced prompt with style
      let fullPrompt = context ? `${context}\n\n${prompt}` : prompt;
      if (stylePreset && stylePreset !== 'natural') {
        fullPrompt = `Style: ${stylePreset}. ${fullPrompt}`;
      }

      let { operation } = await startVideoGeneration({
        prompt: fullPrompt,
        aspectRatio: aspectRatio,
        durationSeconds: duration,
        style: stylePreset,
      });

      toast({
        title: 'Video Generation in Progress',
        description: 'Polling for completion...'
      });

      const MAX_POLL_TIME = 5 * 60 * 1000; // 5 minutes
      const POLL_INTERVAL = 10000; // 10 seconds
      const startTime = Date.now();

      while (Date.now() - startTime < MAX_POLL_TIME) {
        const result = await checkVideoOperation({ operation });
        operation = result.operation;

        if (result.done) {
          if (result.error) {
            throw new Error(result.error);
          }
          if (result.videoUrl) {
            setVideoUrl(result.videoUrl);
            updateNodeData({ videoUrl: result.videoUrl });
            toast({
              title: 'Video Generated!',
              description: 'Your video has been created successfully.'
            });
            setIsLoading(false);
            return;
          }
          throw new Error("Generation finished but no video URL was found.");
        }

        await sleep(POLL_INTERVAL);
      }

      throw new Error('Video generation timed out after 5 minutes');

    } catch (error: unknown) {
      console.error("Video generation failed", error);
      toast({
        variant: 'destructive',
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Could not generate the video.'
      });
      setIsLoading(false);
    }
  };

  const handleAspectRatioChange = (value: string) => {
    setAspectRatio(value);
    updateNodeData({ aspectRatio: value });
  };

  const handleStyleChange = (value: string) => {
    setStylePreset(value);
    updateNodeData({ stylePreset: value });
  };

  const handleModelChange = (value: string, model: ModelOption) => {
    updateNodeData({ selectedModel: model.id, selectedModelRouteHint: model.routeHint });
    toast({
      title: "Model Switched",
      description: `Now using ${model.name}.`
    });
  };


  return (
    <NodeShell
      id={id}
      nodeType="generateVideo"
      selected={selected}
      onDelete={deleteNode}
      minWidth={340}
      contentClassName="p-4 relative"
      title="Generate Video"
      icon={<Video className="h-full w-full" />}
    >

      <div className="nodrag flex flex-col h-full gap-y-3">
        <Textarea
          placeholder="Describe the video you want to create..."
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            updateNodeData({ prompt: e.target.value });
          }}
          className="nodrag bg-transparent w-full resize-none border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 p-0 text-base leading-relaxed placeholder:text-muted-foreground/50 min-h-[60px]"
          disabled={isLoading}
        />

        {/* Settings */}
        <ParameterGroup title="Settings">
          <div className="space-y-3">
            {/* Duration Slider */}
            <ParameterSlider
              label="Duration"
              value={duration}
              onChange={(val) => {
                setDuration(val);
                updateNodeData({ duration: val });
              }}
              min={5}
              max={15}
              step={1}
              unit="s"
              tooltip="Video duration in seconds (5-15s)"
              disabled={isLoading}
            />

            {/* Aspect Ratio */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Aspect Ratio</Label>
              <Select value={aspectRatio} onValueChange={handleAspectRatioChange} disabled={isLoading}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Aspect Ratio" />
                </SelectTrigger>
                <SelectContent>
                  {aspectRatios.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Style Preset */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Style</Label>
              <Select value={stylePreset} onValueChange={handleStyleChange} disabled={isLoading}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Style" />
                </SelectTrigger>
                <SelectContent>
                  {stylePresets.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </ParameterGroup>

        {/* Control Bar */}
        <NodeControlBar
          modelValue={data.selectedModel}
          onModelChange={handleModelChange}
          modelType="video"
          onAction={handleGenerate}
          actionIcon={<Wand2 className="size-4" />}
          isLoading={isLoading}
          actionDisabled={!prompt}
        />

        {(isLoading || videoUrl) && (
          <div className="aspect-video w-full bg-muted rounded-md flex items-center justify-center">
            {isLoading && (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Generating... (2-5 min)</p>
              </div>
            )}
            {!isLoading && videoUrl && (
              <video src={videoUrl} controls className="w-full h-full rounded-md" />
            )}
          </div>
        )}
      </div>

      <NodeHandle type="target" position={Position.Left} nodeType="generateVideo" isConnectable={isConnectable} id="prompt-input" />
      <NodeHandle type="source" position={Position.Right} nodeType="generateVideo" isConnectable={isConnectable} id="video-output" />
    </NodeShell>
  );
};

export default memo(GenerateVideoNode);
