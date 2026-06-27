'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Activity } from '@/types/crm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Trash2, Building2, User, Briefcase, AlertCircle } from 'lucide-react';
import { formatDistanceToNow, format, isBefore, startOfDay, endOfDay, addDays } from 'date-fns';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const getPriorityColor = (priority?: string) => {
  const colors: Record<string, string> = {
    low: 'bg-blue-500/10 text-blue-500',
    medium: 'bg-yellow-500/10 text-yellow-500',
    high: 'bg-orange-500/10 text-orange-500',
    urgent: 'bg-red-500/10 text-red-500',
  };
  return colors[priority || 'medium'] || colors.medium;
};

const getTargetLink = (activity: Activity) => {
  if (activity.contactId) {
    return `/crm/contacts/${activity.contactId}`;
  } else if (activity.companyId) {
    return `/crm/companies/${activity.companyId}`;
  } else if (activity.dealId) {
    return `/crm/deals/${activity.dealId}`;
  }
  return null;
};

const getTargetIcon = (activity: Activity) => {
  if (activity.contactId) {
    return User;
  } else if (activity.companyId) {
    return Building2;
  } else if (activity.dealId) {
    return Briefcase;
  }
  return null;
};

const isOverdue = (task: Activity) => {
  if (!task.dueDate || task.status === 'completed') return false;
  return isBefore(new Date(task.dueDate), new Date());
};

const isDueToday = (task: Activity) => {
  if (!task.dueDate || task.status === 'completed') return false;
  const now = new Date();
  const dueDate = new Date(task.dueDate);
  return dueDate >= startOfDay(now) && dueDate <= endOfDay(now);
};

const _isDueThisWeek = (task: Activity) => {
  if (!task.dueDate || task.status === 'completed') return false;
  const now = new Date();
  const dueDate = new Date(task.dueDate);
  const weekEnd = endOfDay(addDays(now, 7));
  return dueDate >= startOfDay(now) && dueDate <= weekEnd;
};

export function getTaskColumns(
  onDelete?: (activity: Activity) => void,
  onToggleComplete?: (activity: Activity) => void
): ColumnDef<Activity>[] {
  return [
    {
      id: 'complete',
      header: '',
      cell: ({ row }) => {
        const task = row.original;
        const isCompleted = task.status === 'completed';

        return (
          <Checkbox
            checked={isCompleted}
            onCheckedChange={() => onToggleComplete?.(task)}
            aria-label="Mark complete"
            onClick={(e) => e.stopPropagation()}
          />
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: 'title',
      header: 'Task',
      cell: ({ row }) => {
        const task = row.original;
        const isCompleted = task.status === 'completed';

        return (
          <div>
            <div
              className={cn(
                'font-medium',
                isCompleted && 'line-through text-muted-foreground'
              )}
            >
              {task.title}
            </div>
            {task.bodyPlain && (
              <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                {task.bodyPlain}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'dueDate',
      header: 'Due Date',
      cell: ({ row }) => {
        const task = row.original;

        if (!task.dueDate) {
          return <span className="text-muted-foreground">—</span>;
        }

        const dueDate = new Date(task.dueDate);
        const overdue = isOverdue(task);
        const dueToday = isDueToday(task);

        return (
          <div className="flex items-center gap-2">
            {overdue && <AlertCircle className="size-3 text-red-500" />}
            <div className={cn(
              'text-sm',
              overdue && 'text-red-500 font-medium',
              dueToday && !overdue && 'text-amber-500 font-medium'
            )}>
              <div>{format(dueDate, 'MMM d, yyyy')}</div>
              <div className="text-xs">
                {formatDistanceToNow(dueDate, { addSuffix: true })}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: ({ row }) => {
        const priority = row.getValue('priority') as string;
        return (
          <Badge variant="outline" className={getPriorityColor(priority)}>
            {priority || 'medium'}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'assignedTo',
      header: 'Assigned',
      cell: ({ row }) => {
        const task = row.original;
        if (!task.assignedTo) {
          return <span className="text-muted-foreground">—</span>;
        }

        return (
          <div className="flex items-center gap-2 text-sm">
            <User className="size-3 text-muted-foreground" />
            <span>Assigned</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'targetType',
      header: 'Related To',
      cell: ({ row }) => {
        const task = row.original;
        const targetLink = getTargetLink(task);
        const TargetIcon = getTargetIcon(task);

        if (!targetLink || !TargetIcon) {
          return <span className="text-muted-foreground">—</span>;
        }

        return (
          <Link href={targetLink} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-sm hover:underline">
              <TargetIcon className="size-3 text-muted-foreground" />
              <span className="capitalize">{task.targetType}</span>
            </div>
          </Link>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const task = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={getTargetLink(task) || '#'}>
                  <Eye className="mr-2 size-4" />
                  View Details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {onDelete && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(task);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
