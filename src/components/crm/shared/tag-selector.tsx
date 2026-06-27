'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useTags } from '@/hooks/crm/use-tags';

interface TagSelectorProps {
  value: string[];
  onChange: (value: string[]) => void;
  entityType?: 'contact' | 'company' | 'deal' | 'all';
  className?: string;
}

export function TagSelector({ value, onChange, entityType = 'all', className }: TagSelectorProps) {
  const [open, setOpen] = useState(false);
  const { tags, loading: _loading } = useTags({ type: entityType, limit: 100 });

  const selectedTags = tags.filter((tag) => value.includes(tag._id));

  const handleSelect = (tagId: string) => {
    if (value.includes(tagId)) {
      onChange(value.filter((id) => id !== tagId));
    } else {
      onChange([...value, tagId]);
    }
  };

  const handleRemove = (tagId: string) => {
    onChange(value.filter((id) => id !== tagId));
  };

  return (
    <div className={cn('space-y-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            <span className="text-muted-foreground">
              {selectedTags.length === 0 ? 'Select tags...' : `${selectedTags.length} selected`}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput placeholder="Search tags..." />
            <CommandEmpty>No tags found.</CommandEmpty>
            <CommandGroup className="max-h-64 overflow-auto">
              {tags.map((tag) => (
                <CommandItem
                  key={tag._id}
                  value={tag.name}
                  onSelect={() => handleSelect(tag._id)}
                >
                  <Check
                    className={cn(
                      'mr-2 size-4',
                      value.includes(tag._id) ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div
                    className="size-3 rounded-full mr-2"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedTags.map((tag) => (
            <Badge
              key={tag._id}
              variant="secondary"
              className="gap-1"
              style={{
                backgroundColor: `${tag.color}20`,
                borderColor: tag.color,
                color: tag.color,
              }}
            >
              {tag.name}
              <button
                type="button"
                onClick={() => handleRemove(tag._id)}
                className="hover:opacity-70"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
