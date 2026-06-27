'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface ActivityFiltersProps {
  type?: string;
  status?: string;
  targetType?: string;
  onTypeChange?: (value: string) => void;
  onStatusChange?: (value: string) => void;
  onTargetTypeChange?: (value: string) => void;
}

export function ActivityFilters({
  type,
  status,
  targetType,
  onTypeChange,
  onStatusChange,
  onTargetTypeChange,
}: ActivityFiltersProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {onTypeChange && (
        <div className="space-y-2">
          <Label htmlFor="activity-type">Activity Type</Label>
          <Select value={type || 'all'} onValueChange={onTypeChange}>
            <SelectTrigger id="activity-type">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="note">Note</SelectItem>
              <SelectItem value="task">Task</SelectItem>
              <SelectItem value="call">Call</SelectItem>
              <SelectItem value="meeting">Meeting</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="message">Message</SelectItem>
              <SelectItem value="calendar_event">Calendar Event</SelectItem>
              <SelectItem value="deal_created">Deal Created</SelectItem>
              <SelectItem value="deal_stage_changed">Deal Stage Changed</SelectItem>
              <SelectItem value="deal_won">Deal Won</SelectItem>
              <SelectItem value="deal_lost">Deal Lost</SelectItem>
              <SelectItem value="contact_created">Contact Created</SelectItem>
              <SelectItem value="form_submission">Form Submission</SelectItem>
              <SelectItem value="workflow_triggered">Workflow Triggered</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {onStatusChange && (
        <div className="space-y-2">
          <Label htmlFor="activity-status">Status</Label>
          <Select value={status || 'all'} onValueChange={onStatusChange}>
            <SelectTrigger id="activity-status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {onTargetTypeChange && (
        <div className="space-y-2">
          <Label htmlFor="target-type">Related To</Label>
          <Select value={targetType || 'all'} onValueChange={onTargetTypeChange}>
            <SelectTrigger id="target-type">
              <SelectValue placeholder="All targets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Targets</SelectItem>
              <SelectItem value="contact">Contacts</SelectItem>
              <SelectItem value="company">Companies</SelectItem>
              <SelectItem value="deal">Deals</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
