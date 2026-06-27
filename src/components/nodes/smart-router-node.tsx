'use client';

import React, { memo } from 'react';
import { Position, NodeProps } from 'reactflow';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import NodeShell from './node-shell';
import { Route, Plus, X, ArrowRight } from 'lucide-react';
import { useNodeUtils } from '@/hooks/use-node-utils';
import NodeHandle from './node-handle';

interface RouteEntry {
  id: string;
  condition: string;
  label: string;
}

const SmartRouterNode = ({ id, data, isConnectable, selected }: NodeProps) => {
  const { updateNodeData, deleteNode } = useNodeUtils(id);

  const routes: RouteEntry[] = data.routes || [
    { id: 'route_1', condition: '', label: 'Route 1' },
  ];

  const addRoute = () => {
    const newRoute: RouteEntry = {
      id: `route_${Date.now()}`,
      condition: '',
      label: `Route ${routes.length + 1}`,
    };
    updateNodeData({ routes: [...routes, newRoute] });
  };

  const removeRoute = (routeId: string) => {
    if (routes.length <= 1) return;
    updateNodeData({ routes: routes.filter(r => r.id !== routeId) });
  };

  const updateRoute = (routeId: string, field: 'condition' | 'label', value: string) => {
    updateNodeData({
      routes: routes.map(r => r.id === routeId ? { ...r, [field]: value } : r),
    });
  };

  // Calculate handle positions for output routes
  const totalHandles = routes.length + 1; // routes + "otherwise"
  const getHandleTop = (index: number) => {
    const spacing = 100 / (totalHandles + 1);
    return `${spacing * (index + 1)}%`;
  };

  return (
    <NodeShell
      id={id}
      nodeType="smartRouterNode"
      selected={selected}
      onDelete={deleteNode}
      hasAdvanced={true}
      minWidth={320}
      minHeight={280}
      contentClassName="p-4 relative h-full flex flex-col"
      title="Smart Router"
      icon={<Route className="h-full w-full" />}
    >
      <NodeHandle type="target" position={Position.Left} nodeType="smartRouterNode" isConnectable={isConnectable} />

      <div className="nodrag flex flex-col h-full w-full gap-y-2.5 overflow-y-auto">
        <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Route Conditions <span className="normal-case text-muted-foreground/60">(supports natural language)</span>
        </Label>

        {routes.map((route, index) => (
          <div key={route.id} className="flex items-start gap-1.5 group">
            <div className="flex-1 space-y-1 bg-muted/20 rounded-xl p-2 border border-border/20">
              <div className="flex items-center gap-1.5">
                <div className="size-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-bold text-primary">{index + 1}</span>
                </div>
                <Input
                  value={route.label}
                  onChange={(e) => updateRoute(route.id, 'label', e.target.value)}
                  className="h-6 text-xs rounded-full border-none bg-transparent p-0 font-medium focus-visible:ring-0"
                  placeholder="Route name"
                />
                {routes.length > 1 && (
                  <button type="button" onClick={() => removeRoute(route.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="size-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
              </div>
              <Input
                value={route.condition}
                onChange={(e) => updateRoute(route.id, 'condition', e.target.value)}
                className="h-7 text-xs rounded-lg bg-background/50 border-border/30"
                placeholder='e.g. "Customer is interested in pricing" or sentiment === positive'
              />
            </div>
            <ArrowRight className="size-4 text-muted-foreground/40 mt-4 shrink-0" />
          </div>
        ))}

        {/* Otherwise / Default */}
        <div className="flex items-center gap-1.5">
          <div className="flex-1 bg-muted/10 rounded-xl px-3 py-2 border border-dashed border-border/30">
            <span className="text-xs text-muted-foreground italic">Otherwise (default)</span>
          </div>
          <ArrowRight className="size-4 text-muted-foreground/20 shrink-0" />
        </div>

        {/* Add Route */}
        <Button
          variant="ghost"
          size="sm"
          onClick={addRoute}
          className="h-7 text-xs rounded-full gap-1 self-start text-muted-foreground hover:text-primary"
        >
          <Plus className="size-3.5" /> Add Route
        </Button>
      </div>

      {/* Dynamic output handles for each route */}
      {routes.map((route, index) => (
        <NodeHandle
          key={route.id}
          type="source"
          position={Position.Right}
          nodeType="smartRouterNode"
          id={route.id}
          isConnectable={isConnectable}
          style={{ top: getHandleTop(index) }}
        />
      ))}
      {/* Otherwise handle */}
      <NodeHandle
        type="source"
        position={Position.Right}
        nodeType="smartRouterNode"
        id="otherwise"
        isConnectable={isConnectable}
        style={{ top: getHandleTop(routes.length) }}
      />
    </NodeShell>
  );
};

export default memo(SmartRouterNode);
