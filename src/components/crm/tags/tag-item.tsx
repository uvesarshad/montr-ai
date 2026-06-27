'use client';

import { Tag } from '@/types/crm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Edit, Trash2, Merge } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface TagItemProps {
  tag: Tag;
  onEdit?: (tag: Tag) => void;
  onDelete?: (tag: Tag) => void;
  onMerge?: (tag: Tag) => void;
}

export function TagItem({ tag, onEdit, onDelete, onMerge }: TagItemProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div
              className="size-10 rounded-md shrink-0"
              style={{ backgroundColor: tag.color }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-medium truncate">{tag.name}</h3>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {tag.type === 'all' ? 'All' : tag.type}
                </Badge>
              </div>
              {tag.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {tag.description}
                </p>
              )}
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span>{tag.usageCount || 0} uses</span>
                {tag.createdAt && (
                  <span>
                    Created {new Date(tag.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 shrink-0">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(tag)}>
                  <Edit className="mr-2 size-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {onMerge && (
                <DropdownMenuItem onClick={() => onMerge(tag)}>
                  <Merge className="mr-2 size-4" />
                  Merge with another
                </DropdownMenuItem>
              )}
              {(onEdit || onMerge) && onDelete && <DropdownMenuSeparator />}
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(tag)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
