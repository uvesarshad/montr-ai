'use client';

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { GitBranch, GitMerge, Filter, Router, Clock, Repeat, StopCircle } from 'lucide-react';

const getIconForSubType = (subType: string) => {
  switch (subType) {
    case 'branch':
      return <GitBranch className="size-4 text-amber-600" />;
    case 'switch':
      return <GitMerge className="size-4 text-amber-600" />;
    case 'filter':
      return <Filter className="size-4 text-amber-600" />;
    case 'router':
      return <Router className="size-4 text-amber-600" />;
    case 'delay':
      return <Clock className="size-4 text-gray-600" />;
    case 'loop':
      return <Repeat className="size-4 text-gray-600" />;
    case 'end':
      return <StopCircle className="size-4 text-gray-600" />;
    default:
      return <GitBranch className="size-4 text-amber-600" />;
  }
};

const getColorForSubType = (subType: string) => {
  if (subType === 'delay' || subType === 'loop' || subType === 'end') {
    return { bg: 'bg-gray-100', border: 'border-gray-300', selected: 'border-gray-500' };
  }
  return { bg: 'bg-amber-100', border: 'border-amber-300', selected: 'border-amber-500' };
};

export function LogicNode({ data, selected }: NodeProps) {
  const colors = getColorForSubType(data.subType);
  const icon = getIconForSubType(data.subType);
  const isEndNode = data.subType === 'end';

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white shadow-md min-w-[200px] ${
        selected ? colors.selected : colors.border
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white"
      />

      <div className="flex items-center gap-2 mb-2">
        <div className={`size-8 rounded-full ${colors.bg} flex items-center justify-center`}>
          {icon}
        </div>
        <div className="flex-1">
          <div className="font-medium text-sm text-gray-900">
            {data.label || 'Logic'}
          </div>
          <div className="text-xs text-gray-500">{data.subType}</div>
        </div>
      </div>

      {/* Show condition preview for branch/switch */}
      {(data.subType === 'branch' || data.subType === 'switch') && data.config?.condition && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-600 line-clamp-2 font-mono">
            {data.config.condition}
          </div>
        </div>
      )}

      {/* Show duration for delay */}
      {data.subType === 'delay' && data.config?.duration && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-600">
            Wait {data.config.duration}s
          </div>
        </div>
      )}

      {/* Output handle - not for end nodes */}
      {!isEndNode && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white"
        />
      )}

      {/* For branch nodes, show true/false handles */}
      {data.subType === 'branch' && (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            className="!w-3 !h-3 !bg-green-500 !border-2 !border-white"
            style={{ top: '50%' }}
          />
          <Handle
            type="source"
            position={Position.Left}
            id="false"
            className="!w-3 !h-3 !bg-red-500 !border-2 !border-white"
            style={{ top: '50%' }}
          />
        </>
      )}
    </div>
  );
}
