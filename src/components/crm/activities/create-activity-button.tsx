'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ActivityForm } from './activity-form';
import { Plus, ChevronDown, StickyNote, CheckSquare, Phone, Calendar } from 'lucide-react';
import { ActivityTypeInput } from '@/validations/crm/activity.schema';

interface CreateActivityButtonProps {
  targetType?: 'contact' | 'company' | 'deal';
  targetId?: string;
  onSuccess?: () => void;
}

export function CreateActivityButton({
  targetType,
  targetId,
  onSuccess,
}: CreateActivityButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ActivityTypeInput>('note');

  const handleSuccess = () => {
    setIsOpen(false);
    onSuccess?.();
  };

  // If targetType and targetId are provided, show simple button
  if (targetType && targetId) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="size-4 mr-2" />
            New Activity
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Activity</DialogTitle>
            <DialogDescription>
              Add a new activity to track your interactions and tasks
            </DialogDescription>
          </DialogHeader>
          <ActivityForm
            targetType={targetType}
            targetId={targetId}
            onSuccess={handleSuccess}
            onCancel={() => setIsOpen(false)}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // Otherwise, show dropdown menu to select activity type
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus className="size-4 mr-2" />
          New Activity
          <ChevronDown className="size-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            setSelectedType('note');
            setIsOpen(true);
          }}
        >
          <StickyNote className="mr-2 size-4" />
          Create Note
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setSelectedType('task');
            setIsOpen(true);
          }}
        >
          <CheckSquare className="mr-2 size-4" />
          Create Task
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setSelectedType('call');
            setIsOpen(true);
          }}
        >
          <Phone className="mr-2 size-4" />
          Log Call
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setSelectedType('meeting');
            setIsOpen(true);
          }}
        >
          <Calendar className="mr-2 size-4" />
          Schedule Meeting
        </DropdownMenuItem>
      </DropdownMenuContent>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Create {selectedType.charAt(0).toUpperCase() + selectedType.slice(1)}
            </DialogTitle>
            <DialogDescription>
              {selectedType === 'note' && 'Add a note to track your thoughts and observations'}
              {selectedType === 'task' && 'Create a task to keep track of what needs to be done'}
              {selectedType === 'call' && 'Log a call to record your conversation'}
              {selectedType === 'meeting' && 'Schedule a meeting with a contact or company'}
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground mb-4">
            Please select a contact, company, or deal to associate this activity with.
          </div>
          {/* Note: This form won't work without targetType and targetId */}
          {/* We should show a selector here or disable this for now */}
          <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
            <p className="text-sm text-amber-600">
              To create an activity, please go to a specific contact, company, or deal page.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </DropdownMenu>
  );
}
