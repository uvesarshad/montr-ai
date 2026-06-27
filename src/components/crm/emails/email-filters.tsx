'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

interface EmailFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showUnreadOnly: boolean;
  onUnreadOnlyChange: (show: boolean) => void;
}

export function EmailFilters({
  searchQuery,
  onSearchChange,
  showUnreadOnly,
  onUnreadOnlyChange,
}: EmailFiltersProps) {
  return (
    <div className="flex items-center gap-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search emails..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-8 pr-8 w-[250px]"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-2"
            onClick={() => onSearchChange('')}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      {/* Unread only */}
      <div className="flex items-center space-x-2">
        <Checkbox
          id="unread-only"
          checked={showUnreadOnly}
          onCheckedChange={(checked) => onUnreadOnlyChange(!!checked)}
        />
        <Label
          htmlFor="unread-only"
          className="text-sm font-normal cursor-pointer"
        >
          Unread only
        </Label>
      </div>
    </div>
  );
}
