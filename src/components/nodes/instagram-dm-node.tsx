'use client';

import React, { memo } from 'react';
import { Position, NodeProps } from 'reactflow';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import NodeShell from './node-shell';
import { Instagram, MessageCircle, Reply, Sparkles } from 'lucide-react';
import { useNodeUtils } from '@/hooks/use-node-utils';
import NodeHandle from './node-handle';

const MODES = [
  { value: 'comment_to_dm', label: 'Comment → DM', icon: MessageCircle, desc: 'Auto-DM when someone comments a keyword' },
  { value: 'auto_reply_dm', label: 'Auto-Reply DM', icon: Reply, desc: 'Auto-respond to incoming DMs' },
  { value: 'story_reply', label: 'Story Reply', icon: Sparkles, desc: 'Auto-respond to story mentions' },
];

const InstagramDMNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { updateNodeData, deleteNode } = useNodeUtils(id);

  const mode = data.mode || 'comment_to_dm';
  const keywords = data.keywords || '';
  const messageTemplate = data.messageTemplate || '';
  const delaySeconds = data.delaySeconds || 5;

  return (
    <NodeShell
      id={id}
      nodeType="instagramDMNode"
      selected={selected}
      onDelete={deleteNode}
      hasAdvanced={true}
      minWidth={300}
      minHeight={320}
      contentClassName="p-4 relative h-full flex flex-col"
      title="Instagram DM"
      icon={<Instagram className="h-full w-full" />}
    >
      <NodeHandle type="target" position={Position.Left} nodeType="instagramDMNode" isConnectable={isConnectable} />
      <div className="nodrag flex flex-col h-full w-full space-y-3">
        {/* Mode Selector */}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Automation Mode</Label>
          <div className="space-y-1.5">
            {MODES.map(m => {
              const Icon = m.icon;
              return (
                <button
                  key={m.value}
                  onClick={() => updateNodeData({ mode: m.value })}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors border ${mode === m.value
                    ? 'bg-gradient-to-r from-pink-500/10 to-purple-500/10 border-pink-500/30 text-foreground'
                    : 'bg-muted/20 border-border/20 text-muted-foreground hover:bg-muted/40'
                    }`}
                >
                  <Icon className={`size-4 shrink-0 ${mode === m.value ? 'text-pink-500' : ''}`} />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{m.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{m.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Keywords */}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {mode === 'comment_to_dm' ? 'Trigger Keywords' : mode === 'auto_reply_dm' ? 'Keyword Filter' : 'Story Keywords'}
          </Label>
          <Input
            value={keywords}
            onChange={(e) => updateNodeData({ keywords: e.target.value })}
            className="h-8 text-xs rounded-full"
            placeholder="e.g. info, pricing, link (comma-separated)"
          />
        </div>

        {/* Message Template */}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Message Template</Label>
          <Textarea
            value={messageTemplate}
            onChange={(e) => updateNodeData({ messageTemplate: e.target.value })}
            className="nodrag text-xs min-h-[60px] resize-none rounded-xl bg-muted/30 border-border/30"
            placeholder="Hey {{username}}! Thanks for your interest. Here's the link: ..."
          />
        </div>

        {/* Delay */}
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Delay before send</Label>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-medium">{delaySeconds}s</span>
            <Slider
              value={[delaySeconds]}
              onValueChange={([v]) => updateNodeData({ delaySeconds: v })}
              min={0} max={60} step={5}
              className="w-20"
            />
          </div>
        </div>
      </div>
      <NodeHandle type="source" position={Position.Right} nodeType="instagramDMNode" isConnectable={isConnectable} />
    </NodeShell>
  );
};

export default memo(InstagramDMNode);
