'use client';

import React, { memo, useState } from 'react';
import { Position, NodeProps } from 'reactflow';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import NodeShell, { NodeControlBar } from './node-shell';
import { type ModelOption } from './model-selector';
import { Bot, Send, BookOpen, Users, Mail, MessageSquare, Share2, ArrowUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNodeUtils } from '@/hooks/use-node-utils';
import NodeHandle from './node-handle';

const TOOL_OPTIONS = [
  { key: 'sendDM', label: 'Send DM', icon: Send },
  { key: 'readCRM', label: 'Read CRM', icon: Users },
  { key: 'updateCRM', label: 'Update CRM', icon: Users },
  { key: 'searchKB', label: 'Search KB', icon: BookOpen },
  { key: 'sendEmail', label: 'Send Email', icon: Mail },
  { key: 'sendWhatsApp', label: 'WhatsApp', icon: MessageSquare },
  { key: 'createPost', label: 'Create Post', icon: Share2 },
  { key: 'publishSocial', label: 'Publish Social', icon: Share2 },
  { key: 'generateContent', label: 'Generate Content', icon: Bot },
  { key: 'analyzeData', label: 'Analytics', icon: Users },
];

const PERSONALITIES = [
  { value: 'friendly', label: 'Friendly Sales Rep' },
  { value: 'support', label: 'Support Agent' },
  { value: 'professional', label: 'Professional' },
  { value: 'brand', label: 'Brand Voice' },
  { value: 'custom', label: 'Custom' },
];

const AgenticNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { toast } = useToast();
  const { updateNodeData, deleteNode, getIncomingContent } = useNodeUtils(id);

  const [goal, setGoal] = useState(data.goal || '');
  const [isLoading, setIsLoading] = useState(false);

  const enabledTools: Record<string, boolean> = data.enabledTools || {};
  const personality = data.personality || 'friendly';
  const maxSteps = data.maxSteps || 5;
  const memoryEnabled = data.memoryEnabled !== false;
  const _fallbackAction = data.fallbackAction || 'Transfer to human';

  const handleGoalChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setGoal(e.target.value);
    updateNodeData({ goal: e.target.value });
  };

  const toggleTool = (key: string) => {
    const updated = { ...enabledTools, [key]: !enabledTools[key] };
    updateNodeData({ enabledTools: updated });
  };

  const handleRun = async () => {
    if (!goal.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please enter a goal for the agent.' });
      return;
    }
    if (!data.selectedModel) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please select a model first.' });
      return;
    }
    setIsLoading(true);
    toast({ title: 'Agent running...', description: 'AI agent is working on your goal.' });

    try {
      const context = getIncomingContent();
      const activeTools = Object.entries(enabledTools).filter(([, v]) => v).map(([k]) => k);

      const response = await fetch('/api/v2/ai-workflow/agent-execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal, context, personality, maxSteps,
          tools: activeTools,
          model: data.selectedModel,
          memoryEnabled,
        }),
      });

      if (!response.ok) throw new Error('Agent execution failed');
      const result = await response.json();

      updateNodeData({ lastResult: result.output, goal });
      toast({ title: 'Agent Complete!', description: 'The agent has finished its task.' });
    } catch (error) {
      console.error('Agentic node failed:', error);
      toast({ variant: 'destructive', title: 'Agent Error', description: error instanceof Error ? error.message : 'Agent failed.' });
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
      nodeType="agenticNode"
      selected={selected}
      onDelete={deleteNode}
      hasAdvanced={true}
      minWidth={320}
      minHeight={380}
      contentClassName="p-4 relative h-full flex flex-col"
      title="AI Agent"
      icon={<Bot className="h-full w-full" />}
    >
      <NodeHandle type="target" position={Position.Left} nodeType="agenticNode" isConnectable={isConnectable} />
      <div className="nodrag flex flex-col h-full w-full gap-y-3 overflow-y-auto">
        {/* Goal */}
        <Textarea
          value={goal}
          onChange={handleGoalChange}
          className="nodrag bg-transparent w-full resize-none border-none shadow-none focus-visible:ring-0 p-0 text-sm leading-relaxed placeholder:text-muted-foreground/50 min-h-[50px]"
          placeholder="Describe the agent's goal... e.g. 'Reply to every Instagram DM about pricing with our latest price sheet'"
          disabled={isLoading}
        />

        {/* Personality */}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Personality</Label>
          <Select value={personality} onValueChange={(v) => updateNodeData({ personality: v })}>
            <SelectTrigger className="h-8 text-xs rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERSONALITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Tools */}
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tools Enabled</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {TOOL_OPTIONS.map(tool => {
              const Icon = tool.icon;
              const isOn = !!enabledTools[tool.key];
              return (
                <button
                  type="button"
                  key={tool.key}
                  onClick={() => toggleTool(tool.key)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-colors border ${isOn
                    ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                    : 'bg-muted/30 border-border/30 text-muted-foreground hover:bg-muted/50'
                    }`}
                >
                  <Icon className="size-3 shrink-0" />
                  <span className="truncate">{tool.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Memory & Steps */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Switch checked={memoryEnabled} onCheckedChange={(v) => updateNodeData({ memoryEnabled: v })} className="scale-75" />
            <Label className="text-xs text-muted-foreground">Memory</Label>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Steps:</Label>
            <span className="text-xs font-mono font-medium w-4 text-center">{maxSteps}</span>
            <Slider
              value={[maxSteps]}
              onValueChange={([v]) => updateNodeData({ maxSteps: v })}
              min={1} max={10} step={1}
              className="w-16"
            />
          </div>
        </div>

        {/* Control Bar */}
        <NodeControlBar
          modelValue={data.selectedModel}
          onModelChange={handleModelChange}
          modelType="text"
          onAction={handleRun}
          actionIcon={<ArrowUp className="size-4" />}
          isLoading={isLoading}
          actionDisabled={!goal.trim()}
        />
      </div>
      <NodeHandle type="source" position={Position.Right} nodeType="agenticNode" isConnectable={isConnectable} />
    </NodeShell>
  );
};

export default memo(AgenticNode);
