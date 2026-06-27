'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface TaskFiltersProps {
  status?: string;
  overdueOnly?: boolean;
  assignedToMe?: boolean;
  dueDateAfter?: Date;
  dueDateBefore?: Date;
  priority?: string;
  onStatusChange?: (value: string) => void;
  onOverdueOnlyChange?: (value: boolean) => void;
  onAssignedToMeChange?: (value: boolean) => void;
  onDueDateAfterChange?: (date: Date | undefined) => void;
  onDueDateBeforeChange?: (date: Date | undefined) => void;
  onPriorityChange?: (value: string) => void;
}

export function TaskFilters({
  status,
  overdueOnly,
  assignedToMe,
  dueDateAfter,
  dueDateBefore,
  priority,
  onStatusChange,
  onOverdueOnlyChange,
  onAssignedToMeChange,
  onDueDateAfterChange,
  onDueDateBeforeChange,
  onPriorityChange,
}: TaskFiltersProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {onStatusChange && (
          <div className="space-y-2">
            <Label htmlFor="task-status">Status</Label>
            <Select value={status || 'active'} onValueChange={onStatusChange}>
              <SelectTrigger id="task-status">
                <SelectValue placeholder="All tasks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tasks</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {onPriorityChange && (
          <div className="space-y-2">
            <Label htmlFor="task-priority">Priority</Label>
            <Select value={priority || 'all'} onValueChange={onPriorityChange}>
              <SelectTrigger id="task-priority">
                <SelectValue placeholder="All priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {onDueDateAfterChange && (
          <div className="space-y-2">
            <Label htmlFor="due-date-from">Due Date From</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="due-date-from"
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !dueDateAfter && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {dueDateAfter ? format(dueDateAfter, 'PPP') : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dueDateAfter}
                  onSelect={onDueDateAfterChange}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {onDueDateBeforeChange && (
          <div className="space-y-2">
            <Label htmlFor="due-date-to">Due Date To</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="due-date-to"
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !dueDateBefore && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {dueDateBefore ? format(dueDateBefore, 'PPP') : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dueDateBefore}
                  onSelect={onDueDateBeforeChange}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        <div className="space-y-2 md:col-span-2">
          <Label>Quick Filters</Label>
          <div className="flex flex-wrap gap-4">
            {onOverdueOnlyChange && (
              <div className="flex items-center gap-x-2">
                <Checkbox
                  id="overdue"
                  checked={overdueOnly}
                  onCheckedChange={onOverdueOnlyChange}
                />
                <label
                  htmlFor="overdue"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Overdue only
                </label>
              </div>
            )}

            {onAssignedToMeChange && (
              <div className="flex items-center gap-x-2">
                <Checkbox
                  id="assigned-to-me"
                  checked={assignedToMe}
                  onCheckedChange={onAssignedToMeChange}
                />
                <label
                  htmlFor="assigned-to-me"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Assigned to me
                </label>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
