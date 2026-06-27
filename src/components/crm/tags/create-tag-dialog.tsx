'use client';

import { useReducer, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Tag } from '@/types/crm';
import { Plus } from 'lucide-react';

interface CreateTagDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: (tag: Tag) => void;
  tag?: Tag;
  trigger?: React.ReactNode;
}

const colorOptions = [
  { value: '#3b82f6', label: 'Blue' },
  { value: '#10b981', label: 'Green' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Red' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#84cc16', label: 'Lime' },
];

interface TagFormState {
  name: string;
  color: string;
  type: Tag['type'];
  description: string;
}

type TagFormAction =
  | { type: 'setName'; value: string }
  | { type: 'setColor'; value: string }
  | { type: 'setType'; value: Tag['type'] }
  | { type: 'setDescription'; value: string }
  | { type: 'reset'; state: TagFormState };

function tagFormReducer(state: TagFormState, action: TagFormAction): TagFormState {
  switch (action.type) {
    case 'setName':
      return { ...state, name: action.value };
    case 'setColor':
      return { ...state, color: action.value };
    case 'setType':
      return { ...state, type: action.value };
    case 'setDescription':
      return { ...state, description: action.value };
    case 'reset':
      return action.state;
    default:
      return state;
  }
}

export function CreateTagDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onSuccess,
  tag,
  trigger,
}: CreateTagDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;

  const [form, dispatchForm] = useReducer(tagFormReducer, {
    name: tag?.name || '',
    color: tag?.color || '#3b82f6',
    type: tag?.type || 'all',
    description: tag?.description || '',
  });
  const { name, color, type, description } = form;
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Tag name is required',
      });
      return;
    }

    setLoading(true);

    try {
      const url = tag ? `/api/v2/crm/tags/${tag._id}` : '/api/v2/crm/tags';
      const method = tag ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          color,
          type,
          description: description.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save tag');
      }

      const savedTag = await response.json();

      toast({
        title: tag ? 'Tag updated' : 'Tag created',
        description: `The tag "${name}" has been successfully ${tag ? 'updated' : 'created'}.`,
      });

      onSuccess?.(savedTag);
      setOpen(false);

      // Reset form
      if (!tag) {
        dispatchForm({
          type: 'reset',
          state: { name: '', color: '#3b82f6', type: 'all', description: '' },
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save tag',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button className="gap-2">
            <Plus className="size-4" />
            New Tag
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{tag ? 'Edit Tag' : 'Create Tag'}</DialogTitle>
            <DialogDescription>
              {tag
                ? 'Update the tag details below'
                : 'Add a new tag to categorize your CRM records'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., VIP Customer"
                value={name}
                onChange={(e) => dispatchForm({ type: 'setName', value: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="color">Color</Label>
              <div className="flex gap-2">
                {colorOptions.map((colorOption) => (
                  <button
                    key={colorOption.value}
                    type="button"
                    onClick={() => dispatchForm({ type: 'setColor', value: colorOption.value })}
                    className={`size-8 rounded-md border-2 transition-all ${
                      color === colorOption.value
                        ? 'border-foreground scale-110'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: colorOption.value }}
                    title={colorOption.label}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Applies To</Label>
              <Select
                value={type}
                // @ts-expect-error onValueChange provides a string, narrowed to TagType
                onValueChange={(value: string) => dispatchForm({ type: 'setType', value })}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All (Contacts, Companies, Deals)</SelectItem>
                  <SelectItem value="contact">Contacts Only</SelectItem>
                  <SelectItem value="company">Companies Only</SelectItem>
                  <SelectItem value="deal">Deals Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Add a description for this tag..."
                value={description}
                onChange={(e) => dispatchForm({ type: 'setDescription', value: e.target.value })}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : tag ? 'Update Tag' : 'Create Tag'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
