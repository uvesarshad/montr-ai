'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Activity } from '@/types/crm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Trash2, Building2, User, Briefcase } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { ActivityTypeIcon } from './activity-type-icon';

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-500/10 text-yellow-500',
    completed: 'bg-green-500/10 text-green-500',
    cancelled: 'bg-red-500/10 text-red-500',
    scheduled: 'bg-blue-500/10 text-blue-500',
  };
  return colors[status] || 'bg-gray-500/10 text-gray-500';
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

export function getActivityColumns(
  onDelete?: (activity: Activity) => void
): ColumnDef<Activity>[] {
  return [
    {
      accessorKey: 'type',
      header: 'Type',
      cell: ({ row }) => {
        const activity = row.original;
        return (
          <div className="flex items-center gap-2">
            <ActivityTypeIcon type={activity.type} size={14} />
            <span className="text-sm capitalize">{activity.type.replace('_', ' ')}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'title',
      header: 'Title',
      cell: ({ row }) => {
        const activity = row.original;

        return (
          <div>
            <div className="font-medium">{activity.title}</div>
            {activity.bodyPlain && (
              <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                {activity.bodyPlain}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'targetType',
      header: 'Related To',
      cell: ({ row }) => {
        const activity = row.original;
        const targetLink = getTargetLink(activity);
        const TargetIcon = getTargetIcon(activity);

        if (!targetLink || !TargetIcon) {
          return <span className="text-muted-foreground">—</span>;
        }

        return (
          <Link href={targetLink} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-sm hover:underline">
              <TargetIcon className="size-3 text-muted-foreground" />
              <span className="capitalize">{activity.targetType}</span>
            </div>
          </Link>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.getValue('status') as string;
        return (
          <Badge variant="outline" className={getStatusColor(status)}>
            {status}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Date',
      cell: ({ row }) => {
        const activity = row.original;
        const date = activity.dueDate || activity.startDate || activity.createdAt;

        return (
          <div className="text-sm">
            <div>{format(new Date(date), 'MMM d, yyyy')}</div>
            <div className="text-xs text-muted-foreground">
              {format(new Date(date), 'h:mm a')}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'assignedTo',
      header: 'Assigned',
      cell: ({ row }) => {
        const activity = row.original;
        if (!activity.assignedTo) {
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
      id: 'actions',
      cell: ({ row }) => {
        const activity = row.original;

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
                <Link href={getTargetLink(activity) || '#'}>
                  <Eye className="mr-2 size-4" />
                  View Details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {onDelete && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(activity);
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
