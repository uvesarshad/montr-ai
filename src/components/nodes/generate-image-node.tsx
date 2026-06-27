'use client';

import React, { useCallback, memo, useState, useEffect } from 'react';
import { Position, NodeProps, useReactFlow, getIncomers } from 'reactflow';
import NodeShell, { NodeControlBar } from './node-shell';
import { Textarea } from '@/components/ui/textarea';
import { Image as ImageIcon, Loader2, Wand2 } from 'lucide-react';
import { generateImage } from '@/ai/flows/generate-image-flow';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import Image from 'next/image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ParameterSlider, ParameterGroup } from '@/components/parameters';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useNodeExecution } from '@/contexts/execution-context';
import { MultiImageInput, InputImage } from './multi-image-input';
import NodeHandle from './node-handle';
import { type ModelOption } from './model-selector';

const aspectRatios = [
  { value: '1:1', label: 'Square (1:1)' },
  { value: '16:9', label: 'Widescreen (16:9)' },
  { value: '9:16', label: 'Portrait (9:16)' },
  { value: '4:3', label: 'Standard (4:3)' },
  { value: '3:2', label: 'Photo (3:2)' },
];

const GenerateImageNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { getNodes, getEdges } = useReactFlow();
  const { toast } = useToast();
  const { updateNodeData, deleteNode, getIncomingContext: _getIncomingContext } = useNodeUtils(id);

  // Basic state
  const [prompt, setPrompt] = useState(data.prompt || '');
  const [isLoading, setIsLoading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(data.aspectRatio || '1:1');

  // Advanced parameters (read from data, configured via sidebar)
  // data.guidanceScale, data.seed, data.negativePrompt are managed via advanced panel

  // Basic parameters still managed inline
  const [numOutputs, setNumOutputs] = useState(data.numOutputs || 1);

  // Generated images (array for multiple outputs)
  const [generatedImages, setGeneratedImages] = useState<string[]>(data.generatedImages || []);

  // Input images from connected nodes
  const [inputImages, setInputImages] = useState<InputImage[]>([]);

  // Execution tracking for visual feedback
  const execution = useNodeExecution(id);

  const getNodeContent = useCallback((node: { data: Record<string, unknown> }): { context: string, imageDataUris: string[] } => {
    let context = '';
    const imageDataUris: string[] = [];

    const textContent = node.data.text || node.data.transcript || node.data.markdownContent || '';
    if (textContent) {
      context += textContent + '\n\n';
    }

    if (node.data.imageUrl) {
      imageDataUris.push(node.data.imageUrl as string);
    }
    if (node.data.generatedImages && Array.isArray(node.data.generatedImages)) {
      imageDataUris.push(...node.data.generatedImages);
    }
    if (node.data.files && Array.isArray(node.data.files)) {
      node.data.files.forEach((file: { type?: string; previewUrl?: string }) => {
        if (file.type === 'image' && file.previewUrl) {
          imageDataUris.push(file.previewUrl);
        }
      });
    }

    return { context: context.trim(), imageDataUris };
  }, []);

  const getCombinedContext = useCallback(() => {
    const allNodes = getNodes();
    const allEdges = getEdges();
    const currentNode = allNodes.find(n => n.id === id);

    if (!currentNode) return { context: '', imageDataUri: null };

    const incomers = getIncomers(currentNode, allNodes, allEdges);

    let combinedContext = '';
    const allImageDataUris: string[] = [];

    incomers.forEach(node => {
      const { context, imageDataUris } = getNodeContent(node);
      if (context) {
        combinedContext += (combinedContext ? '\n\n' : '') + context;
      }
      if (imageDataUris.length > 0) {
        allImageDataUris.push(...imageDataUris);
      }
    });

    const finalImageDataUri = allImageDataUris.length > 0 ? allImageDataUris.join('|||') : null;

    return { context: combinedContext, imageDataUri: finalImageDataUri, allImageDataUris };
  }, [getNodes, getEdges, id, getNodeContent]);

  // Update input images when connections change
  useEffect(() => {
    const { allImageDataUris } = getCombinedContext() as { allImageDataUris?: string[] };
    if (!allImageDataUris) return;

    // Create InputImage objects from detected images
    const newInputImages: InputImage[] = (allImageDataUris || []).map((url: string, i: number) => ({
      id: `input-${i}-${url.slice(-20)}`,
      url,
      sourceNodeId: 'connected',
      handleId: 'image',
      selected: true, // Select all by default
    }));

    // Only update if images changed
    const currentUrls = inputImages.map(img => img.url).join(',');
    const newUrls = newInputImages.map((img: InputImage) => img.url).join(',');
    if (currentUrls !== newUrls) {
      setInputImages(newInputImages);
    }
  }, [getEdges, getNodes, getCombinedContext, inputImages]);

  useEffect(() => {
    const { context } = getCombinedContext();
    const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;
    if (fullPrompt !== prompt) {
      setPrompt(fullPrompt);
    }
  }, [getEdges, getNodes, getCombinedContext, prompt]);

  const handleGenerate = async () => {
    if (!data.selectedModel) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select a model first.' });
      return;
    }
    setIsLoading(true);
    setGeneratedImages([]);
    updateNodeData({ generatedImages: [] });
    execution.start('Generating images...');

    const toastMessage = numOutputs > 1
      ? `Generating ${numOutputs} images...`
      : 'Generating image...';
    toast({ title: toastMessage, description: 'The AI is creating your image(s). This may take a moment.' });

    try {
      const { context } = getCombinedContext();
      const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;

      // Use only selected input images
      const selectedImages = inputImages.filter(img => img.selected);
      const imageDataUri = selectedImages.length > 0
        ? selectedImages.map(img => img.url).join('|||')
        : null;

      // Batch size to avoid overwhelming the browser
      const BATCH_SIZE = 4;
      const allImageUrls: string[] = [];

      // Process in batches
      for (let batchStart = 0; batchStart < numOutputs; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, numOutputs);
        const batchSize = batchEnd - batchStart;

        // Update progress
        execution.updateProgress(
          Math.round((batchStart / numOutputs) * 100),
          `Generating batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(numOutputs / BATCH_SIZE)}...`
        );

        // Generate this batch in parallel
        const batchPromises = Array.from({ length: batchSize }).map(async (_, i) => {
          const index = batchStart + i;
          const result = await generateImage({
            prompt: fullPrompt,
            model: data.selectedModel,
            imageDataUri: imageDataUri,
            aspectRatio: aspectRatio,
            guidanceScale: data.guidanceScale ?? 7.5,
            seed: (data.seed ?? null) !== null ? (data.seed ?? 0) + index : undefined,
            negativePrompt: data.negativePrompt || undefined,
          });
          return result.imageUrl;
        });

        const batchResults = await Promise.all(batchPromises);
        allImageUrls.push(...batchResults);

        // Update UI progressively as each batch completes
        setGeneratedImages([...allImageUrls]);
        updateNodeData({
          generatedImages: [...allImageUrls],
          imageUrl: allImageUrls[0] || null,
        });
      }

      const successMessage = numOutputs > 1
        ? `${allImageUrls.length} images generated!`
        : 'Image generated!';
      toast({ title: successMessage, description: 'Your image(s) have been created successfully.' });
      execution.complete();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Generation failed';
      console.error("Image generation failed", error);
      toast({ variant: 'destructive', title: 'Generation Failed', description: errorMessage || 'Could not generate the image.' });
      execution.fail(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModelChange = (value: string, model: ModelOption) => {
    updateNodeData({ selectedModel: model.id, selectedModelRouteHint: model.routeHint });
    toast({
      title: "Model Switched",
      description: `Now using ${model.name}.`
    });
  };

  const handleAspectRatioChange = (value: string) => {
    setAspectRatio(value);
    updateNodeData({ aspectRatio: value });
  };

  // Determine grid columns based on number of outputs
  const getGridCols = () => {
    if (numOutputs <= 1) return 'grid-cols-1';
    if (numOutputs <= 4) return 'grid-cols-2';
    if (numOutputs <= 9) return 'grid-cols-3';
    return 'grid-cols-4';
  };

  // Get status-based border styling
  const getStatusBorderClass = () => {
    switch (execution.status) {
      case 'running': return 'ring-2 ring-blue-500 ring-offset-2';
      case 'completed': return 'ring-2 ring-green-500 ring-offset-2';
      case 'failed': return 'ring-2 ring-red-500 ring-offset-2';
      default: return '';
    }
  };

  return (
    <NodeShell
      id={id}
      nodeType="generateImage"
      selected={selected}
      onDelete={deleteNode}
      hasAdvanced={true}
      minWidth={340}
      contentClassName="p-4 relative"
      title="Generate Image"
      icon={<ImageIcon className="h-full w-full" />}
      className={getStatusBorderClass()}
    >

      <div className="nodrag flex flex-col h-full gap-y-3">
        {/* Multi-Image Input Display */}
        {inputImages.length > 0 && (
          <MultiImageInput
            images={inputImages}
            onSelectionChange={(updated) => setInputImages(updated)}
            onReorder={(updated) => setInputImages(updated)}
            disabled={isLoading}
          />
        )}

        {/* Prompt Input */}
        <Textarea
          placeholder="Describe the image you want to create..."
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            updateNodeData({ prompt: e.target.value });
          }}
          className="nodrag bg-transparent w-full resize-none border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 p-0 text-base leading-relaxed placeholder:text-muted-foreground/50 min-h-[60px]"
          disabled={isLoading}
        />

        {/* Basic Settings */}
        <ParameterGroup title="Settings">
          <div className="space-y-3">
            {/* Number of Outputs */}
            <ParameterSlider
              label="Number of Outputs"
              value={numOutputs}
              onChange={(val) => {
                setNumOutputs(val);
                updateNodeData({ numOutputs: val });
              }}
              min={1}
              max={10}
              step={1}
              tooltip="How many image variations to generate (processed in batches of 4)"
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
          </div>
        </ParameterGroup>

        {/* Control Bar */}
        <NodeControlBar
          modelValue={data.selectedModel}
          onModelChange={handleModelChange}
          modelType="image"
          onAction={handleGenerate}
          actionIcon={<Wand2 className="size-4" />}
          isLoading={isLoading}
          actionDisabled={!prompt}
        />

        {/* Output Grid */}
        {(isLoading || generatedImages.length > 0) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">
                Outputs {generatedImages.length > 0 && `(${generatedImages.length}/${numOutputs})`}
              </Label>
            </div>
            <div className={cn('grid gap-2', getGridCols())}>
              {Array.from({ length: numOutputs }).map((_, index) => (
                <div
                  key={`output-slot-${index}`}
                  className="aspect-square bg-muted rounded-md flex items-center justify-center relative overflow-hidden"
                >
                  {isLoading && index >= generatedImages.length && (
                    <Loader2 className="size-6 animate-spin text-primary" />
                  )}
                  {generatedImages[index] && (
                    <Image
                      src={generatedImages[index]}
                      alt={`Generated image ${index + 1}`}
                      fill
                      className="rounded-md object-contain"
                    />
                  )}
                  {numOutputs > 1 && (
                    <div className="absolute top-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                      {index + 1}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <NodeHandle type="target" position={Position.Left} nodeType="generateImage" isConnectable={isConnectable} id="context-input" />

      {/* Dynamic output handles based on numOutputs */}
      {numOutputs === 1 ? (
        // Single centered handle for single output
        <NodeHandle
          type="source"
          position={Position.Right}
          nodeType="generateImage"
          isConnectable={isConnectable}
          id="image-output-0"
        />
      ) : (
        // Multiple handles distributed vertically
        Array.from({ length: numOutputs }).map((_, index) => (
          <NodeHandle
            key={`output-${index}`}
            type="source"
            position={Position.Right}
            nodeType="generateImage"
            isConnectable={isConnectable}
            id={`image-output-${index}`}
            style={{
              top: `${((index + 1) / (numOutputs + 1)) * 100}%`,
            }}
          />
        ))
      )}
    </NodeShell>
  );
};

export default memo(GenerateImageNode);
