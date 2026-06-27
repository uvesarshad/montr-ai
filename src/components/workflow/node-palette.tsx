'use client';

import React, { useState } from 'react';
import {
  MessageSquare,
  Image as ImageIcon,
  Mail,
  Users,
  Briefcase,
  Tag,
  Calendar,
  GitBranch,
  GitMerge,
  Filter,
  Router,
  Database,
  Shuffle,
  Clock,
  Repeat,
  StopCircle,
  Sparkles,
  Globe,
  Webhook,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface NodeType {
  type: string;
  subType: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: string;
}

const nodeCategories = {
  triggers: {
    label: 'Triggers',
    color: 'text-green-600',
    nodes: [
      {
        type: 'trigger',
        subType: 'message_received',
        label: 'Message Received',
        description: 'Trigger when a message is received',
        icon: <MessageSquare className="size-4" />,
        category: 'triggers',
      },
      {
        type: 'trigger',
        subType: 'record_created',
        label: 'Record Created',
        description: 'Trigger when a CRM record is created',
        icon: <Users className="size-4" />,
        category: 'triggers',
      },
      {
        type: 'trigger',
        subType: 'record_updated',
        label: 'Record Updated',
        description: 'Trigger when a CRM record is updated',
        icon: <Users className="size-4" />,
        category: 'triggers',
      },
      {
        type: 'trigger',
        subType: 'deal_stage_changed',
        label: 'Deal Stage Changed',
        description: 'Trigger when deal stage changes',
        icon: <Briefcase className="size-4" />,
        category: 'triggers',
      },
      {
        type: 'trigger',
        subType: 'tag_added',
        label: 'Tag Added',
        description: 'Trigger when tag is added to record',
        icon: <Tag className="size-4" />,
        category: 'triggers',
      },
    ],
  },
  whatsapp: {
    label: 'WhatsApp',
    color: 'text-blue-600',
    nodes: [
      {
        type: 'action',
        subType: 'send_whatsapp_text',
        label: 'Send Text',
        description: 'Send WhatsApp text message',
        icon: <MessageSquare className="size-4" />,
        category: 'whatsapp',
      },
      {
        type: 'action',
        subType: 'send_whatsapp_image',
        label: 'Send Image',
        description: 'Send WhatsApp image',
        icon: <ImageIcon className="size-4" />,
        category: 'whatsapp',
      },
      {
        type: 'action',
        subType: 'send_whatsapp_template',
        label: 'Send Template',
        description: 'Send WhatsApp template message',
        icon: <MessageSquare className="size-4" />,
        category: 'whatsapp',
      },
    ],
  },
  crm: {
    label: 'CRM',
    color: 'text-purple-600',
    nodes: [
      {
        type: 'action',
        subType: 'create_contact',
        label: 'Create Contact',
        description: 'Create new CRM contact',
        icon: <Users className="size-4" />,
        category: 'crm',
      },
      {
        type: 'action',
        subType: 'update_contact',
        label: 'Update Contact',
        description: 'Update existing contact',
        icon: <Users className="size-4" />,
        category: 'crm',
      },
      {
        type: 'action',
        subType: 'create_deal',
        label: 'Create Deal',
        description: 'Create new deal',
        icon: <Briefcase className="size-4" />,
        category: 'crm',
      },
      {
        type: 'action',
        subType: 'update_deal',
        label: 'Update Deal',
        description: 'Update existing deal',
        icon: <Briefcase className="size-4" />,
        category: 'crm',
      },
      {
        type: 'action',
        subType: 'add_tag',
        label: 'Add Tag',
        description: 'Add tag to record',
        icon: <Tag className="size-4" />,
        category: 'crm',
      },
      {
        type: 'action',
        subType: 'create_activity',
        label: 'Create Activity',
        description: 'Create note/task/call/meeting',
        icon: <Calendar className="size-4" />,
        category: 'crm',
      },
    ],
  },
  email: {
    label: 'Marketing Email',
    color: 'text-indigo-600',
    nodes: [
      {
        type: 'action',
        subType: 'send_marketing_email',
        label: 'Send Email',
        description: 'Send marketing email',
        icon: <Mail className="size-4" />,
        category: 'email',
      },
    ],
  },
  ai: {
    label: 'AI',
    color: 'text-pink-600',
    nodes: [
      {
        type: 'ai',
        subType: 'generate_text',
        label: 'Generate Text',
        description: 'Generate text using AI',
        icon: <Sparkles className="size-4" />,
        category: 'ai',
      },
      {
        type: 'ai',
        subType: 'generate_image',
        label: 'Generate Image',
        description: 'Generate image using AI',
        icon: <ImageIcon className="size-4" />,
        category: 'ai',
      },
    ],
  },
  logic: {
    label: 'Logic',
    color: 'text-amber-600',
    nodes: [
      {
        type: 'logic',
        subType: 'branch',
        label: 'Branch (If/Else)',
        description: 'Conditional branching',
        icon: <GitBranch className="size-4" />,
        category: 'logic',
      },
      {
        type: 'logic',
        subType: 'switch',
        label: 'Switch',
        description: 'Multiple conditions',
        icon: <GitMerge className="size-4" />,
        category: 'logic',
      },
      {
        type: 'logic',
        subType: 'filter',
        label: 'Filter',
        description: 'Filter array items',
        icon: <Filter className="size-4" />,
        category: 'logic',
      },
      {
        type: 'logic',
        subType: 'router',
        label: 'Router',
        description: 'Route to multiple paths',
        icon: <Router className="size-4" />,
        category: 'logic',
      },
    ],
  },
  data: {
    label: 'Data',
    color: 'text-violet-600',
    nodes: [
      {
        type: 'data',
        subType: 'set_variable',
        label: 'Set Variable',
        description: 'Set variable value',
        icon: <Database className="size-4" />,
        category: 'data',
      },
      {
        type: 'data',
        subType: 'transform',
        label: 'Transform Data',
        description: 'Transform data structure',
        icon: <Shuffle className="size-4" />,
        category: 'data',
      },
    ],
  },
  integration: {
    label: 'Integration',
    color: 'text-cyan-600',
    nodes: [
      {
        type: 'integration',
        subType: 'http_request',
        label: 'HTTP Request',
        description: 'Make HTTP API call',
        icon: <Globe className="size-4" />,
        category: 'integration',
      },
      {
        type: 'integration',
        subType: 'send_webhook',
        label: 'Send Webhook',
        description: 'Send webhook notification',
        icon: <Webhook className="size-4" />,
        category: 'integration',
      },
    ],
  },
  control: {
    label: 'Control',
    color: 'text-gray-600',
    nodes: [
      {
        type: 'control',
        subType: 'delay',
        label: 'Delay',
        description: 'Wait before continuing',
        icon: <Clock className="size-4" />,
        category: 'control',
      },
      {
        type: 'control',
        subType: 'loop',
        label: 'Loop',
        description: 'Iterate over array',
        icon: <Repeat className="size-4" />,
        category: 'control',
      },
      {
        type: 'control',
        subType: 'end',
        label: 'End',
        description: 'End workflow',
        icon: <StopCircle className="size-4" />,
        category: 'control',
      },
    ],
  },
};

export function NodePalette() {
  const [searchQuery, setSearchQuery] = useState('');
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    triggers: true,
    whatsapp: true,
    crm: true,
    email: true,
    ai: true,
    logic: true,
    data: true,
    integration: true,
    control: true,
  });

  const onDragStart = (event: React.DragEvent, nodeType: NodeType) => {
    event.dataTransfer.setData(
      'application/reactflow',
      JSON.stringify({
        type: nodeType.type,
        subType: nodeType.subType,
        label: nodeType.label,
      })
    );
    event.dataTransfer.effectAllowed = 'move';
  };

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const filteredCategories = Object.entries(nodeCategories).map(
    ([key, category]) => ({
      key,
      ...category,
      nodes: category.nodes.filter(
        (node) =>
          node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          node.description.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    })
  );

  return (
    <div className="w-64 border-r bg-white flex flex-col h-full">
      <div className="p-4 border-b">
        <h3 className="font-semibold text-lg mb-3">Node Palette</h3>
        <Input
          placeholder="Search nodes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9"
        />
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredCategories.map((category) => {
            if (category.nodes.length === 0) return null;

            return (
              <Collapsible
                key={category.key}
                open={openCategories[category.key]}
                onOpenChange={() => toggleCategory(category.key)}
                className="mb-2"
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-100 rounded-lg">
                  <span className={`font-medium text-sm ${category.color}`}>
                    {category.label}
                  </span>
                  {openCategories[category.key] ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                </CollapsibleTrigger>

                <CollapsibleContent className="space-y-1 mt-1">
                  {category.nodes.map((node) => (
                    <div
                      key={`${node.type}_${node.subType}`}
                      draggable
                      onDragStart={(e) => onDragStart(e, node)}
                      className="flex items-start gap-2 p-2 rounded-lg border border-gray-200 bg-white cursor-move hover:border-gray-300 hover:shadow-sm transition-all"
                    >
                      <div className={`mt-0.5 ${category.color}`}>
                        {node.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900">
                          {node.label}
                        </div>
                        <div className="text-xs text-gray-500 line-clamp-2">
                          {node.description}
                        </div>
                      </div>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </ScrollArea>

      <div className="p-4 border-t text-xs text-gray-500 text-center">
        Drag nodes onto the canvas
      </div>
    </div>
  );
}
