'use client';

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Zap } from 'lucide-react';

export function TriggerNode({ data, selected }: NodeProps) {
  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white shadow-md min-w-[200px] ${
        selected ? 'border-green-500' : 'border-green-300'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="size-8 rounded-full bg-green-100 flex items-center justify-center">
          <Zap className="size-4 text-green-600" />
        </div>
        <div className="flex-1">
          <div className="font-medium text-sm text-gray-900">
            {data.label || 'Trigger'}
          </div>
          <div className="text-xs text-gray-500">{data.subType}</div>
        </div>
      </div>

      {/* Only output handle for triggers */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-white"
      />
    </div>
  );
}
