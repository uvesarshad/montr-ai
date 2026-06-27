'use client';

import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

export interface ResourceLinkItem {
  _id: string;
  title: string;
  subtitle?: string;
}

interface ResourceLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  searchPlaceholder: string;
  emptyLabel: string;
  items: ResourceLinkItem[];
  isLoading?: boolean;
  createLabel?: string;
  onCreate?: () => void;
  onSelect: (item: ResourceLinkItem) => void;
}

export function ResourceLinkDialog({
  open,
  onOpenChange,
  title,
  description,
  searchPlaceholder,
  emptyLabel,
  items,
  isLoading = false,
  createLabel,
  onCreate,
  onSelect,
}: ResourceLinkDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] overflow-hidden p-0 gap-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {createLabel && onCreate ? (
          <div className="border-b px-5 py-3">
            <Button variant="outline" className="w-full justify-start rounded-[0.4rem]" onClick={onCreate}>
              <Plus className="mr-2 size-4" />
              {createLabel}
            </Button>
          </div>
        ) : null}

        <Command className="rounded-none">
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList className="max-h-[360px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                Loading...
              </div>
            ) : (
              <>
                <CommandEmpty>{emptyLabel}</CommandEmpty>
                <CommandGroup heading="Available">
                  {items.map((item) => (
                    <CommandItem
                      key={item._id}
                      value={`${item.title} ${item.subtitle || ''}`}
                      onSelect={() => onSelect(item)}
                      className="flex items-start justify-between gap-3 px-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                        {item.subtitle ? (
                          <p className="mt-1 truncate text-xs text-muted-foreground">{item.subtitle}</p>
                        ) : null}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
