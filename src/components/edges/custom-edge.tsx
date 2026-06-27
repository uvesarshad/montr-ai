'use client';

import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getSmoothStepPath,
  useReactFlow,
} from 'reactflow';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });

  const onEdgeClick = () => {
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
  };

  return (
    <>
      <g className="group">
        {/* Glow layer — visible on hover */}
        <path
          d={edgePath}
          fill="none"
          stroke="currentColor"
          strokeWidth={8}
          strokeOpacity={0}
          className="transition-[stroke-opacity] duration-200 group-hover:!stroke-opacity-20"
          style={{ filter: 'blur(4px)' }}
        />
        <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className={cn(
              'nodrag nopan opacity-0 group-hover:opacity-100 transition-opacity duration-200'
            )}
          >
            <Button
              size="icon"
              variant="ghost"
              className="size-6 rounded-full bg-background hover:bg-muted"
              onClick={onEdgeClick}
            >
              <X className="size-3" />
            </Button>
          </div>
        </EdgeLabelRenderer>
      </g>
    </>
  );
}
