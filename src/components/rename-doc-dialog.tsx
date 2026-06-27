'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser } from '@/hooks/use-user';
import { useDocuments } from '@/hooks/use-montr-data';
// import { doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

interface RenameDocDialogProps {
  docId: string;
  currentName: string;
  docType: 'document' | 'folder';
  children?: ReactNode;
}

export function RenameDocDialog({ docId, currentName, docType, children }: RenameDocDialogProps) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [isSaving, setIsSaving] = useState(false);
  const { user } = useUser();
  const { toast } = useToast();
  // trigger refresh of the document list if needed
  const { mutate } = useDocuments(); // Assuming we want to refresh the list

  const handleSave = async () => {
    if (!user || !name.trim()) return;
    setIsSaving(true);

    try {
      const res = await fetch(`/api/v2/documents/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: name.trim() })
      });

      if (!res.ok) throw new Error('Failed to rename');

      toast({
        title: `${docType === 'folder' ? 'Folder' : 'Document'} Renamed`,
        description: `The item is now named "${name.trim()}".`,
      });
      // Optionally trigger re-fetch if we had context
      mutate?.();
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to rename document.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
      setRenameOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/v2/documents/${docId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete');

      toast({
        title: `${docType === 'folder' ? 'Folder' : 'Document'} Deleted`,
        description: `"${currentName}" has been permanently deleted.`,
      });
      mutate?.();
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to delete document.",
        variant: "destructive"
      });
    } finally {
      setDeleteOpen(false);
    }
  }

  return (
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {children || (
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="size-4" />
              </Button>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
              <Pencil className="mr-2 size-4" />
              <span>Rename</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="text-destructive">
              <Trash2 className="mr-2 size-4" />
              <span>Delete</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rename {docType}</DialogTitle>
            <DialogDescription>
              Enter a new name for your {docType}. Click save when you&apos;re done.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete your {docType}
            and remove its data from our servers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
