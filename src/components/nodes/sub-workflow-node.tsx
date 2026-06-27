'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import NodeShell from './node-shell';
import { Position } from 'reactflow';
import NodeHandle from './node-handle';
import { useNodeUtils } from '@/hooks/use-node-utils';
import { Workflow, ExternalLink, Play, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface CanvasOption {
  id: string;
  name: string;
}

interface SubWorkflowNodeData {
  canvasId?: string;
  passInputData?: boolean;
  waitForCompletion?: boolean;
}

export default function SubWorkflowNode({ id, data }: { id: string; data: SubWorkflowNodeData }) {
  const { updateNodeData } = useNodeUtils(id);

  const selectedCanvasId = data.canvasId || '';
  const passInputData = data.passInputData !== false; // default true
  const waitForCompletion = data.waitForCompletion !== false; // default true

  // Fetch available canvases
  const { data: canvases = [], isLoading } = useQuery({
    queryKey: ['canvases', 'sub-workflow-options'],
    queryFn: async (): Promise<CanvasOption[]> => {
      const res = await fetch('/api/v2/canvases?limit=50');
      if (!res.ok) return [];
      const json = await res.json();
      return (json.canvases || []).map((c: { _id: string; name?: string }) => ({ id: c._id, name: c.name || 'Untitled' }));
    },
  });

  const selectedCanvas = canvases.find(c => c.id === selectedCanvasId);

  return (
    <NodeShell
      id={id}
      nodeType="subWorkflowNode"
      title="Sub-Workflow"
      icon={<Workflow className="size-3.5" />}
    >
      <NodeHandle type="target" position={Position.Left} nodeType="subWorkflowNode" />

      <div className="space-y-3 p-3 pt-0">
        {/* Canvas selector */}
        <div>
          <label className="text-[10px] uppercase text-muted-foreground/60 font-medium mb-1 block">Workflow</label>
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="size-3 animate-spin" />
              Loading workflows...
            </div>
          ) : (
            <Select value={selectedCanvasId} onValueChange={(v) => updateNodeData({ canvasId: v })}>
              <SelectTrigger className="h-8 text-xs rounded-lg bg-muted/30 border-border/30">
                <SelectValue placeholder="Select a workflow..." />
              </SelectTrigger>
              <SelectContent>
                {canvases.map(c => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Options */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={passInputData}
              onChange={(e) => updateNodeData({ passInputData: e.target.checked })}
              className="rounded border-border/40 size-3.5"
            />
            <span className="text-[11px] text-muted-foreground">Pass input data to sub-workflow</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={waitForCompletion}
              onChange={(e) => updateNodeData({ waitForCompletion: e.target.checked })}
              className="rounded border-border/40 size-3.5"
            />
            <span className="text-[11px] text-muted-foreground">Wait for completion</span>
          </label>
        </div>

        {/* Selected canvas info */}
        {selectedCanvas && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 border border-border/20">
            <Play className="size-3 text-cyan-500" />
            <span className="text-[11px] font-medium truncate flex-1">{selectedCanvas.name}</span>
            <a
              href={`/canvas/${selectedCanvasId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/60 hover:text-primary"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="size-3" />
            </a>
          </div>
        )}
      </div>

      <NodeHandle type="source" position={Position.Right} nodeType="subWorkflowNode" />
    </NodeShell>
  );
}
