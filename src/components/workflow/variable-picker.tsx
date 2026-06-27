'use client';

import React, { useState } from 'react';
import { Variable, Zap, Database, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface VariablePickerProps {
  onSelect: (variable: string) => void;
}

interface VariableCategory {
  label: string;
  icon: React.ReactNode;
  variables: Array<{
    name: string;
    description: string;
    example: string;
  }>;
}

const variableCategories: VariableCategory[] = [
  {
    label: 'Trigger Data',
    icon: <Zap className="size-4" />,
    variables: [
      {
        name: '{{$trigger.contact.firstName}}',
        description: 'Contact first name',
        example: 'John',
      },
      {
        name: '{{$trigger.contact.lastName}}',
        description: 'Contact last name',
        example: 'Doe',
      },
      {
        name: '{{$trigger.contact.email}}',
        description: 'Contact email',
        example: 'john@example.com',
      },
      {
        name: '{{$trigger.contact.phone}}',
        description: 'Contact phone',
        example: '+1234567890',
      },
      {
        name: '{{$trigger.deal.name}}',
        description: 'Deal name',
        example: 'Enterprise Deal',
      },
      {
        name: '{{$trigger.deal.amount}}',
        description: 'Deal amount',
        example: '50000',
      },
      {
        name: '{{$trigger.message.text}}',
        description: 'Message text',
        example: 'Hello!',
      },
    ],
  },
  {
    label: 'Variables',
    icon: <Variable className="size-4" />,
    variables: [
      {
        name: '{{variables.custom_variable}}',
        description: 'Access workflow variable',
        example: 'value',
      },
      {
        name: '{{variables.api_response}}',
        description: 'API response data',
        example: '{"status": "success"}',
      },
    ],
  },
  {
    label: 'Node Outputs',
    icon: <Database className="size-4" />,
    variables: [
      {
        name: '{{$nodeId.output}}',
        description: 'Reference node output',
        example: 'Node output value',
      },
      {
        name: '{{$ai_generate.text}}',
        description: 'AI generated text',
        example: 'Generated content',
      },
      {
        name: '{{$create_contact.contactId}}',
        description: 'Created contact ID',
        example: '507f1f77bcf86cd799439011',
      },
    ],
  },
  {
    label: 'System',
    icon: <Clock className="size-4" />,
    variables: [
      {
        name: '{{system.timestamp}}',
        description: 'Current timestamp',
        example: '2024-01-15T10:30:00Z',
      },
      {
        name: '{{system.date}}',
        description: 'Current date',
        example: '2024-01-15',
      },
      {
        name: '{{system.organizationId}}',
        description: 'Organization ID',
        example: '507f1f77bcf86cd799439011',
      },
      {
        name: '{{system.userId}}',
        description: 'User ID',
        example: '507f1f77bcf86cd799439011',
      },
    ],
  },
];

export function VariablePicker({ onSelect }: VariablePickerProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSelect = (variable: string) => {
    onSelect(variable);
    setOpen(false);
    setSearchQuery('');
  };

  const filteredCategories = variableCategories.map((category) => ({
    ...category,
    variables: category.variables.filter(
      (v) =>
        v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.description.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  }));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs">
          <Variable className="size-3 mr-1.5" />
          Insert Variable
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="p-3 border-b">
          <Input
            placeholder="Search variables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <ScrollArea className="h-[400px]">
          <div className="p-2">
            {filteredCategories.map((category, idx) => {
              if (category.variables.length === 0) return null;

              return (
                <div key={category.label}>
                  {idx > 0 && <Separator className="my-2" />}
                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 flex items-center gap-2">
                    {category.icon}
                    {category.label}
                  </div>
                  <div className="space-y-1 mt-1">
                    {category.variables.map((variable) => (
                      <button
                        key={variable.name}
                        onClick={() => handleSelect(variable.name)}
                        className="w-full text-left px-2 py-2 rounded-md hover:bg-gray-100 transition-colors"
                      >
                        <div className="font-mono text-xs text-blue-600 mb-0.5">
                          {variable.name}
                        </div>
                        <div className="text-xs text-gray-600">
                          {variable.description}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Example: <span className="font-mono">{variable.example}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {filteredCategories.every((c) => c.variables.length === 0) && (
              <div className="text-center py-8 text-sm text-gray-500">
                No variables found
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-3 border-t bg-gray-50">
          <div className="text-xs text-gray-500">
            <strong>Advanced:</strong> Use expressions like{' '}
            <code className="bg-white px-1 py-0.5 rounded">
              {'{{contact.company.name}}'}
            </code>{' '}
            or{' '}
            <code className="bg-white px-1 py-0.5 rounded">
              {'{{items[0].value}}'}
            </code>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
