'use client';

import React, { memo, useState, useEffect } from 'react';
import { Position, NodeProps, useReactFlow } from 'reactflow';
import { Textarea } from '@/components/ui/textarea';
import NodeShell, { NodeControlBar } from './node-shell';
import { type ModelOption } from './model-selector';
import NodeHandle from './node-handle';
import { Terminal, ArrowUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import { generateText } from '@/ai/flows/generate-text-flow';

const PromptNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { getEdges } = useReactFlow();
  const { toast } = useToast();
  const { updateNodeData, deleteNode, propagateToOutgoers, getIncomingContent } = useNodeUtils(id);

  // Basic state
  const [prompt, setPrompt] = useState(data.prompt || '');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const aiOutput = data.text;
    if (aiOutput && aiOutput.trim()) {
      const timer = setTimeout(() => {
        propagateToOutgoers(aiOutput);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [getEdges, data.text, propagateToOutgoers]);


  const handleRun = async () => {
    if (!data.selectedModel) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select a model first.' });
      return;
    }
    setIsLoading(true);
    toast({ title: 'AI is running...', description: 'Generating content based on your prompt.' });

    try {
      const context = getIncomingContent();

      const result = await generateText({
        context: context,
        prompt: prompt,
        model: data.selectedModel,
        routeHint: data.selectedModelRouteHint,
        temperature: data.temperature ?? 1.0,
        maxTokens: data.maxTokens ?? 2048,
        systemPrompt: data.systemPrompt || undefined,
      });

      updateNodeData({
        text: result.text,
        prompt: prompt
      });

      propagateToOutgoers(result.text);

      toast({ title: 'AI Task Complete!', description: 'The generated content has been passed to connected nodes.' });

    } catch (error) {
      console.error("Prompt node failed:", error);
      toast({
        variant: 'destructive',
        title: 'AI Error',
        description: error instanceof Error ? error.message : 'Could not generate a response.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleModelChange = (_value: string, model: ModelOption) => {
    updateNodeData({ selectedModel: model.id, selectedModelRouteHint: model.routeHint });
    toast({
      title: "Model Switched",
      description: `Now using ${model.name}.`
    });
  };

  const handlePromptChange = (evt: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(evt.target.value);
    updateNodeData({ prompt: evt.target.value });
  };

  return (
    <NodeShell
      id={id}
      nodeType="promptNode"
      selected={selected}
      onDelete={deleteNode}
      hasAdvanced={true}
      minWidth={340}
      contentClassName="p-4 relative h-full flex flex-col"
      title="Prompt"
      icon={<Terminal className="h-full w-full" />}
    >
      <NodeHandle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        nodeType="promptNode"
      />
      <div className="nodrag flex flex-col h-full w-full space-y-3">
        {/* Prompt Input */}
        <Textarea
          id={`text-${id}`}
          name="text"
          value={prompt}
          onChange={handlePromptChange}
          className="nodrag bg-transparent w-full resize-none border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 p-0 text-base leading-relaxed placeholder:text-muted-foreground/50 min-h-[60px]"
          placeholder="Ask AI to do something..."
          disabled={isLoading}
        />


        {/* Control Bar */}
        <NodeControlBar
          modelValue={data.selectedModel}
          onModelChange={handleModelChange}
          modelType="text"
          onAction={handleRun}
          actionIcon={<ArrowUp className="size-4" />}
          isLoading={isLoading}
          actionDisabled={!prompt}
        />
      </div>
      <NodeHandle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        nodeType="promptNode"
      />
    </NodeShell>
  );
};

export default memo(PromptNode);
