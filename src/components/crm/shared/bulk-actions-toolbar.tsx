'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { X, UserPlus, Tag, Trash2, Mail, MoreHorizontal } from 'lucide-react';

interface BulkActionsToolbarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onAssignOwner?: () => void;
  onAddTags?: () => void;
  onDelete?: () => void;
  onSendEmail?: () => void;
  customActions?: Array<{
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick: () => void;
    variant?: 'default' | 'destructive';
  }>;
  /** Extra action nodes (e.g. RunAutomationMenu) rendered before the More menu. */
  extraActions?: React.ReactNode;
}

export function BulkActionsToolbar({
  selectedCount,
  onClearSelection,
  onAssignOwner,
  onAddTags,
  onDelete,
  onSendEmail,
  customActions,
  extraActions,
}: BulkActionsToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center justify-between p-4 bg-primary/5 border-b">
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="px-3 py-1">
          {selectedCount} selected
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="h-8 gap-1"
        >
          <X className="size-3" />
          Clear
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {onAssignOwner && (
          <Button
            variant="outline"
            size="sm"
            onClick={onAssignOwner}
            className="gap-2"
          >
            <UserPlus className="size-4" />
            Assign Owner
          </Button>
        )}

        {onAddTags && (
          <Button
            variant="outline"
            size="sm"
            onClick={onAddTags}
            className="gap-2"
          >
            <Tag className="size-4" />
            Add Tags
          </Button>
        )}

        {onSendEmail && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSendEmail}
            className="gap-2"
          >
            <Mail className="size-4" />
            Send Email
          </Button>
        )}

        {extraActions}

        {customActions && customActions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <MoreHorizontal className="size-4" />
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {customActions.map((action) => (
                <DropdownMenuItem
                  key={action.label}
                  onClick={action.onClick}
                  className={
                    action.variant === 'destructive'
                      ? 'text-destructive focus:text-destructive'
                      : ''
                  }
                >
                  <action.icon className="mr-2 size-4" />
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {onDelete && (
          <>
            <div className="h-6 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
