'use client';

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Database, Shuffle } from 'lucide-react';

const getIconForSubType = (subType: string) => {
  switch (subType) {
    case 'set_variable':
      return <Database className="size-4 text-violet-600" />;
    case 'transform_data':
      return <Shuffle className="size-4 text-violet-600" />;
    default:
      return <Database className="size-4 text-violet-600" />;
  }
};

export function DataNode({ data, selected }: NodeProps) {
  const icon = getIconForSubType(data.subType);

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white shadow-md min-w-[200px] ${
        selected ? 'border-violet-500' : 'border-violet-300'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white"
      />

      <div className="flex items-center gap-2 mb-2">
        <div className="size-8 rounded-full bg-violet-100 flex items-center justify-center">
          {icon}
        </div>
        <div className="flex-1">
          <div className="font-medium text-sm text-gray-900">
            {data.label || 'Data'}
          </div>
          <div className="text-xs text-gray-500">{data.subType}</div>
        </div>
      </div>

      {/* Show variable name for set_variable */}
      {data.subType === 'set_variable' && data.config?.variableName && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-600 font-mono">
            {data.config.variableName} = {data.config.value || '...'}
          </div>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white"
      />
    </div>
  );
}
