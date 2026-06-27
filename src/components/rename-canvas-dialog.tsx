'use client';

import { useState, type ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import { ActionMenu, ConfirmDialog, FormDialog, Field, Input } from '@/components/ui-kit';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';

interface RenameCanvasDialogProps {
  canvasId: string;
  currentName: string;
  children?: ReactNode;
  onRename?: (canvasId: string, newName: string) => void | Promise<void>;
  onDeleteSuccess?: (canvasId: string) => void | Promise<void>;
}

export function RenameCanvasDialog({
  canvasId,
  currentName,
  children,
  onRename,
  onDeleteSuccess,
}: RenameCanvasDialogProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(currentName);

  const { user } = useUser();
  const { toast } = useToast();

  const handleSave = async () => {
    if (!user || !name.trim()) return;

    const res = await fetch(`/api/v2/canvases/${canvasId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });

    if (!res.ok) {
      toast({ title: 'Error', description: 'Failed to rename canvas.', variant: 'destructive' });
      throw new Error('Failed to rename canvas');
    }

    toast({ title: 'Canvas Renamed', description: `The canvas is now named "${name.trim()}".` });

    if (onRename) {
      await onRename(canvasId, name.trim());
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    try {
      if (onDeleteSuccess) {
        await onDeleteSuccess(canvasId);
      } else {
        const res = await fetch(`/api/v2/canvases/${canvasId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete canvas');
      }

      toast({
        title: 'Canvas Deleted',
        description: `"${currentName}" has been permanently deleted.`,
      });
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to delete canvas.', variant: 'destructive' });
      throw error;
    }
  };

  return (
    <>
      <ActionMenu
        trigger={children}
        items={[
          { label: 'Rename', icon: Pencil, onSelect: () => { setName(currentName); setRenameOpen(true); } },
          { label: 'Delete', icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setDeleteOpen(true) },
        ]}
      />

      <FormDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        title="Rename Canvas"
        description="Enter a new name for your canvas."
        icon={Pencil}
        submitLabel="Save changes"
        submitDisabled={!name.trim()}
        onSubmit={handleSave}
      >
        <Field label="Name" htmlFor="canvas-rename">
          <Input id="canvas-rename" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
      </FormDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Are you absolutely sure?"
        description="This action cannot be undone. This will permanently delete your canvas and remove its data from our servers."
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </>
  );
}
