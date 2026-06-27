'use client';

import React, { useState } from 'react';
import { Position } from 'reactflow';
import NodeHandle from './node-handle';
import { useNodeUtils } from '@/hooks/use-node-utils';
import { Layers, ChevronDown, ChevronUp, EyeOff, Shield } from 'lucide-react';

const GROUP_COLORS = [
  { key: 'blue', label: 'Blue', bg: 'bg-blue-500/8 dark:bg-blue-500/10', border: 'border-blue-500/20' },
  { key: 'purple', label: 'Purple', bg: 'bg-purple-500/8 dark:bg-purple-500/10', border: 'border-purple-500/20' },
  { key: 'green', label: 'Green', bg: 'bg-green-500/8 dark:bg-green-500/10', border: 'border-green-500/20' },
  { key: 'orange', label: 'Orange', bg: 'bg-orange-500/8 dark:bg-orange-500/10', border: 'border-orange-500/20' },
  { key: 'pink', label: 'Pink', bg: 'bg-pink-500/8 dark:bg-pink-500/10', border: 'border-pink-500/20' },
];

interface GroupNodeData {
  label?: string;
  description?: string;
  color?: string;
  disabled?: boolean;
  errorBoundary?: boolean;
}

export default function GroupNode({ id, data }: { id: string; data: GroupNodeData }) {
  const { updateNodeData } = useNodeUtils(id);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const label = data.label || 'Group';
  const description = data.description || '';
  const colorKey = data.color || 'blue';
  const color = GROUP_COLORS.find(c => c.key === colorKey) || GROUP_COLORS[0];
  const disabled: boolean = !!data.disabled;
  const errorBoundary: boolean = !!data.errorBoundary;

  return (
    <div
      className={`min-w-[300px] ${isCollapsed ? 'min-h-[60px]' : 'min-h-[200px]'} rounded-2xl border-2 border-dashed ${color.border} ${color.bg} p-3 transition-all ${disabled ? 'opacity-50' : ''}`}
    >
      {/* Input handle */}
      <NodeHandle type="target" position={Position.Left} nodeType="groupNode" />

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <Layers className="size-4 text-muted-foreground" />
        <input
          value={label}
          onChange={(e) => updateNodeData({ label: e.target.value })}
          className="flex-1 bg-transparent text-sm font-semibold border-none outline-none placeholder:text-muted-foreground/60"
          placeholder="Group name..."
        />
        <button
          type="button"
          onClick={() => updateNodeData({ disabled: !disabled })}
          title={disabled ? 'Enable group' : 'Disable group (skip contained nodes)'}
          className={`p-1 rounded hover:bg-muted/50 ${disabled ? 'text-amber-500' : 'text-muted-foreground/60'}`}
        >
          <EyeOff className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => updateNodeData({ errorBoundary: !errorBoundary })}
          title={errorBoundary ? 'Error boundary on — errors are caught at this group' : 'Error boundary off'}
          className={`p-1 rounded hover:bg-muted/50 ${errorBoundary ? 'text-emerald-500' : 'text-muted-foreground/60'}`}
        >
          <Shield className="size-3.5" />
        </button>
        <div className="flex items-center gap-1">
          {GROUP_COLORS.map(c => (
            <button
              type="button"
              key={c.key}
              onClick={() => updateNodeData({ color: c.key })}
              className={`size-3.5 rounded-full ${c.bg} border ${c.border} ${c.key === colorKey ? 'ring-2 ring-primary ring-offset-1' : ''}`}
            />
          ))}
        </div>
        <button type="button" onClick={() => setIsCollapsed(!isCollapsed)} className="p-0.5 rounded hover:bg-muted/50">
          {isCollapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="space-y-2">
          <textarea
            value={description}
            onChange={(e) => updateNodeData({ description: e.target.value })}
            className="w-full bg-transparent text-xs text-muted-foreground border-none outline-none resize-none placeholder:text-muted-foreground/40"
            placeholder="Describe what this group does..."
            rows={2}
          />
          <div className="min-h-[100px] rounded-xl border border-dashed border-border/30 flex items-center justify-center">
            <p className="text-[10px] text-muted-foreground/40">Drag nodes inside this group</p>
          </div>
        </div>
      )}

      {/* Output handle */}
      <NodeHandle type="source" position={Position.Right} nodeType="groupNode" />
    </div>
  );
}
