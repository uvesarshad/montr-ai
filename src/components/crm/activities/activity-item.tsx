'use client';

import { useState } from 'react';
import { Activity } from '@/types/crm';
import { ActivityTypeIcon } from './activity-type-icon';
import { Button } from '@/components/ui/button';
import { NoteViewer } from '@/components/crm/notes/note-viewer';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreVertical,
  Edit,
  Trash2,
  MapPin,
  Clock,
  User,
  Link as LinkIcon,
  CheckCircle2,
  Circle,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ActivityItemProps {
  activity: Activity;
  onEdit?: (activity: Activity) => void;
  onDelete?: (activity: Activity) => void;
  onToggleComplete?: (activity: Activity) => Promise<void>;
}

export function ActivityItem({
  activity,
  onEdit,
  onDelete,
  onToggleComplete,
}: ActivityItemProps) {
  const [isTogglingComplete, setIsTogglingComplete] = useState(false);

  const handleToggleComplete = async () => {
    if (!onToggleComplete || activity.type !== 'task') return;

    setIsTogglingComplete(true);
    try {
      await onToggleComplete(activity);
    } finally {
      setIsTogglingComplete(false);
    }
  };

  const isTask = activity.type === 'task';
  const isCompleted = activity.status === 'completed';
  const isOverdue =
    isTask &&
    !isCompleted &&
    activity.dueDate &&
    new Date(activity.dueDate) < new Date();

  return (
    <div className="flex gap-3 group">
      <ActivityTypeIcon type={activity.type} size={16} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isTask && (
                <button
                  type="button"
                  onClick={handleToggleComplete}
                  disabled={isTogglingComplete}
                  className="flex-shrink-0 hover:opacity-70 transition-opacity disabled:opacity-50"
                >
                  {isCompleted ? (
                    <CheckCircle2 className="size-4 text-green-600" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground" />
                  )}
                </button>
              )}
              <h4
                className={cn(
                  'font-medium text-sm',
                  isCompleted && 'line-through text-muted-foreground'
                )}
              >
                {activity.title}
              </h4>
              {isOverdue && (
                <Badge variant="destructive" className="text-xs">
                  Overdue
                </Badge>
              )}
            </div>

            {activity.body && (
              <div className="text-sm text-muted-foreground line-clamp-3 mb-2">
                <NoteViewer content={activity.body} />
              </div>
            )}
            {!activity.body && activity.bodyPlain && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                {activity.bodyPlain}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>
                {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
              </span>

              {activity.assignedTo && (
                <div className="flex items-center gap-1">
                  <User className="size-3" />
                  <span>Assigned</span>
                </div>
              )}

              {activity.dueDate && (
                <div className="flex items-center gap-1">
                  <CalendarIcon className="size-3" />
                  <span>Due {format(new Date(activity.dueDate), 'MMM d')}</span>
                </div>
              )}

              {activity.startDate && activity.endDate && (
                <div className="flex items-center gap-1">
                  <Clock className="size-3" />
                  <span>
                    {format(new Date(activity.startDate), 'MMM d, h:mm a')} -{' '}
                    {format(new Date(activity.endDate), 'h:mm a')}
                  </span>
                </div>
              )}

              {activity.calendarMetadata?.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  <span className="truncate max-w-[200px]">
                    {activity.calendarMetadata.location}
                  </span>
                </div>
              )}

              {activity.calendarMetadata?.meetingUrl && (
                <a
                  href={activity.calendarMetadata.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <LinkIcon className="size-3" />
                  <span>Join meeting</span>
                </a>
              )}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="size-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(activity)}>
                  <Edit className="mr-2 size-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(activity)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
