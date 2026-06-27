'use client';

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { MessageSquare, Mail, Users, Sparkles, Globe } from 'lucide-react';

const getIconForSubType = (subType: string) => {
  if (subType?.startsWith('send_whatsapp')) {
    return <MessageSquare className="size-4 text-blue-600" />;
  }
  if (subType?.includes('email')) {
    return <Mail className="size-4 text-indigo-600" />;
  }
  if (subType?.includes('contact') || subType?.includes('company') || subType?.includes('deal')) {
    return <Users className="size-4 text-purple-600" />;
  }
  if (subType?.startsWith('generate_')) {
    return <Sparkles className="size-4 text-pink-600" />;
  }
  if (subType === 'http_request' || subType === 'webhook') {
    return <Globe className="size-4 text-cyan-600" />;
  }
  return <MessageSquare className="size-4 text-blue-600" />;
};

const getColorForSubType = (subType: string) => {
  if (subType?.startsWith('send_whatsapp')) {
    return { bg: 'bg-blue-100', border: 'border-blue-300', selected: 'border-blue-500' };
  }
  if (subType?.includes('email')) {
    return { bg: 'bg-indigo-100', border: 'border-indigo-300', selected: 'border-indigo-500' };
  }
  if (subType?.includes('contact') || subType?.includes('company') || subType?.includes('deal')) {
    return { bg: 'bg-purple-100', border: 'border-purple-300', selected: 'border-purple-500' };
  }
  if (subType?.startsWith('generate_')) {
    return { bg: 'bg-pink-100', border: 'border-pink-300', selected: 'border-pink-500' };
  }
  if (subType === 'http_request' || subType === 'webhook') {
    return { bg: 'bg-cyan-100', border: 'border-cyan-300', selected: 'border-cyan-500' };
  }
  return { bg: 'bg-blue-100', border: 'border-blue-300', selected: 'border-blue-500' };
};

export function ActionNode({ data, selected }: NodeProps) {
  const colors = getColorForSubType(data.subType);
  const icon = getIconForSubType(data.subType);

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
            {data.label || 'Action'}
          </div>
          <div className="text-xs text-gray-500">{data.subType}</div>
        </div>
      </div>

      {/* Show config preview if available */}
      {data.config && Object.keys(data.config).length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-600 line-clamp-2">
            {data.config.message || data.config.prompt || data.config.name || 'Configured'}
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
