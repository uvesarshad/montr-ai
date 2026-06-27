'use client';

import React from 'react';
import NodeShell from './node-shell';
import { Position } from 'reactflow';
import NodeHandle from './node-handle';
import { useNodeUtils } from '@/hooks/use-node-utils';
import { Bot } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

interface DelegateToAgentNodeData {
  task?: string;
  contextData?: string;
  agentId?: string;
}

/**
 * Agent ↔ workflow ties (2.26) — delegate a task to the autonomous Agent module.
 * Inline config = the task instruction; advanced (context path / agent id) lives
 * in the node-config sidebar.
 */
export default function DelegateToAgentNode({ id, data }: { id: string; data: DelegateToAgentNodeData }) {
  const { updateNodeData } = useNodeUtils(id);

  return (
    <NodeShell
      id={id}
      nodeType="delegateToAgentNode"
      title="Delegate to Agent"
      icon={<Bot className="size-3.5" />}
    >
      <NodeHandle type="target" position={Position.Left} nodeType="delegateToAgentNode" />

      <div className="space-y-3 p-3 pt-0">
        <div>
          <label className="text-[10px] uppercase text-muted-foreground/60 font-medium mb-1 block">Task for the agent</label>
          <Textarea
            placeholder="e.g. Follow up with this lead and book a demo."
            value={data.task || ''}
            onChange={(e) => updateNodeData({ task: e.target.value })}
            className="min-h-[70px] text-xs resize-none rounded-lg bg-muted/30 border-border/30"
            rows={3}
          />
        </div>
        <p className="text-[10px] text-muted-foreground/70 leading-snug">
          Creates an agent mission (in draft) for your review. Supports variables.
        </p>
      </div>

      <NodeHandle type="source" position={Position.Right} nodeType="delegateToAgentNode" />
    </NodeShell>
  );
}
