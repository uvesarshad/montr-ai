'use client';

import React, { memo, useState } from 'react';
import { Position, NodeProps } from 'reactflow';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import NodeShell, { NodeControlBar } from './node-shell';
import { type ModelOption } from './model-selector';
import { AudioLines, ArrowUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import NodeHandle from './node-handle';

const MODES = [
  { value: 'tts', label: 'Text to Speech' },
  { value: 'voice_clone', label: 'Voice Clone' },
  { value: 'podcast', label: 'Podcast Generator' },
];

const VOICES = [
  { value: 'alloy', label: 'Alloy' },
  { value: 'echo', label: 'Echo' },
  { value: 'fable', label: 'Fable' },
  { value: 'onyx', label: 'Onyx' },
  { value: 'nova', label: 'Nova' },
  { value: 'shimmer', label: 'Shimmer' },
];

const AudioBotNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { toast } = useToast();
  const { updateNodeData, deleteNode, getIncomingContent } = useNodeUtils(id);
  const [isLoading, setIsLoading] = useState(false);

  const mode = data.mode || 'tts';
  const voice = data.voice || 'alloy';
  const script = data.script || '';
  const speed = data.speed || 1.0;

  const handleRun = async () => {
    if (!script.trim() && !getIncomingContent()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please enter a script or connect input.' });
      return;
    }
    if (!data.selectedModel) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select a model first.' });
      return;
    }
    setIsLoading(true);
    toast({ title: 'Generating audio...', description: 'AI is creating your audio content.' });

    try {
      const context = getIncomingContent();
      const textToSpeak = script.trim() || context;

      // TODO: Integrate with actual TTS API
      const response = await fetch('/api/v2/ai-studio/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSpeak,
          voice,
          speed,
          mode,
          model: data.selectedModel,
        }),
      });

      if (!response.ok) throw new Error('Audio generation failed');
      const result = await response.json();

      updateNodeData({ audioUrl: result.url, script });
      toast({ title: 'Audio Generated!', description: 'Your audio content is ready.' });
    } catch (error) {
      console.error('Audio bot failed:', error);
      toast({ variant: 'destructive', title: 'Audio Error', description: error instanceof Error ? error.message : 'Failed to generate audio.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleModelChange = (_: string, model: ModelOption) => {
    updateNodeData({ selectedModel: model.id, selectedModelRouteHint: model.routeHint });
  };

  return (
    <NodeShell
      id={id}
      nodeType="audioBotNode"
      selected={selected}
      onDelete={deleteNode}
      hasAdvanced={true}
      minWidth={300}
      minHeight={340}
      contentClassName="p-4 relative h-full flex flex-col"
      title="Audio Bot"
      icon={<AudioLines className="h-full w-full" />}
    >
      <NodeHandle type="target" position={Position.Left} nodeType="audioBotNode" isConnectable={isConnectable} />
      <div className="nodrag flex flex-col h-full w-full gap-y-3">
        {/* Mode */}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Mode</Label>
          <Select value={mode} onValueChange={(v) => updateNodeData({ mode: v })}>
            <SelectTrigger className="h-8 text-xs rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Voice */}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Voice</Label>
          <div className="grid grid-cols-3 gap-1">
            {VOICES.map(v => (
              <button
                type="button"
                key={v.value}
                onClick={() => updateNodeData({ voice: v.value })}
                className={`px-2 py-1.5 rounded-lg text-xs transition-colors border ${voice === v.value
                  ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                  : 'bg-muted/20 border-border/20 text-muted-foreground hover:bg-muted/40'
                  }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Script */}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Script / Text</Label>
          <Textarea
            value={script}
            onChange={(e) => updateNodeData({ script: e.target.value })}
            className="nodrag text-xs min-h-[60px] resize-none rounded-xl bg-muted/30 border-border/30"
            placeholder="Enter text to convert to speech, or connect an input node..."
            disabled={isLoading}
          />
        </div>

        {/* Speed */}
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Speed</Label>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-medium w-8 text-right">{speed}x</span>
            <Slider
              value={[speed]}
              onValueChange={([v]) => updateNodeData({ speed: v })}
              min={0.5} max={2.0} step={0.1}
              className="w-24"
            />
          </div>
        </div>

        {/* Audio Preview */}
        {data.audioUrl && (
          <div className="rounded-xl bg-muted/30 p-2 border border-border/20">
            <audio controls src={data.audioUrl} className="w-full h-8" />
          </div>
        )}

        {/* Control Bar */}
        <NodeControlBar
          modelValue={data.selectedModel}
          onModelChange={handleModelChange}
          modelType="text"
          onAction={handleRun}
          actionIcon={<ArrowUp className="size-4" />}
          isLoading={isLoading}
          actionDisabled={!script.trim() && !data.hasInput}
        />
      </div>
      <NodeHandle type="source" position={Position.Right} nodeType="audioBotNode" isConnectable={isConnectable} />
    </NodeShell>
  );
};

export default memo(AudioBotNode);
