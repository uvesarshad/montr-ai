'use client';

import React, { memo, useState } from 'react';
import { Position, NodeProps } from 'reactflow';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import NodeShell from './node-shell';
import { BotMessageSquare, Plus, X } from 'lucide-react';
import { useNodeUtils } from '@/hooks/use-node-utils';
import NodeHandle from './node-handle';

const PLATFORMS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'web', label: 'Web Chat' },
];

const ChatbotNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { updateNodeData, deleteNode } = useNodeUtils(id);
  const [newReply, setNewReply] = useState('');

  const platform = data.platform || 'whatsapp';
  const aiFallback = data.aiFallback !== false;
  const systemPrompt = data.systemPrompt || '';
  const quickReplies: string[] = data.quickReplies || [];
  const welcomeMessage = data.welcomeMessage || '';

  const addQuickReply = () => {
    if (!newReply.trim()) return;
    const updated = [...quickReplies, newReply.trim()];
    updateNodeData({ quickReplies: updated });
    setNewReply('');
  };

  const removeQuickReply = (index: number) => {
    const updated = quickReplies.filter((_, i) => i !== index);
    updateNodeData({ quickReplies: updated });
  };

  return (
    <NodeShell
      id={id}
      nodeType="chatbotNode"
      selected={selected}
      onDelete={deleteNode}
      hasAdvanced={true}
      minWidth={300}
      minHeight={380}
      contentClassName="p-4 relative h-full flex flex-col"
      title="Chatbot"
      icon={<BotMessageSquare className="h-full w-full" />}
    >
      <NodeHandle type="target" position={Position.Left} nodeType="chatbotNode" isConnectable={isConnectable} />
      <div className="nodrag flex flex-col h-full w-full gap-y-3 overflow-y-auto">
        {/* Platform */}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Platform</Label>
          <Select value={platform} onValueChange={(v) => updateNodeData({ platform: v })}>
            <SelectTrigger className="h-8 text-xs rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PLATFORMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Welcome Message */}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Welcome Message</Label>
          <Textarea
            value={welcomeMessage}
            onChange={(e) => updateNodeData({ welcomeMessage: e.target.value })}
            className="nodrag text-xs min-h-[40px] resize-none rounded-xl bg-muted/30 border-border/30"
            placeholder="Hi! 👋 How can I help you today?"
          />
        </div>

        {/* Quick Replies */}
        <div className="space-y-1.5">
          <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Quick Reply Buttons</Label>
          <div className="flex flex-wrap gap-1.5">
            {quickReplies.map((reply, i) => (
              <div key={`reply-${i}-${reply}`} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary">
                <span className="truncate max-w-[100px]">{reply}</span>
                <button type="button" onClick={() => removeQuickReply(i)} className="hover:text-destructive">
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              value={newReply}
              onChange={(e) => setNewReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addQuickReply(); } }}
              className="h-7 text-xs rounded-full flex-1"
              placeholder="Add quick reply..."
            />
            <Button size="icon" variant="ghost" onClick={addQuickReply} className="size-7 rounded-full shrink-0">
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* AI Fallback */}
        <div className="space-y-1.5 pt-1 border-t border-border/20">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">AI Fallback</Label>
            <Switch checked={aiFallback} onCheckedChange={(v) => updateNodeData({ aiFallback: v })} className="scale-75" />
          </div>
          {aiFallback && (
            <Textarea
              value={systemPrompt}
              onChange={(e) => updateNodeData({ systemPrompt: e.target.value })}
              className="nodrag text-xs min-h-[40px] resize-none rounded-xl bg-muted/30 border-border/30"
              placeholder="You are a helpful support assistant for our brand..."
            />
          )}
        </div>
      </div>
      <NodeHandle type="source" position={Position.Right} nodeType="chatbotNode" isConnectable={isConnectable} />
    </NodeShell>
  );
};

export default memo(ChatbotNode);
