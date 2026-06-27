'use client';

import { useState } from 'react';
import { useCustomFields } from '@/hooks/crm/use-custom-fields';
import { CustomField } from '@/types/crm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { MoreVertical, Edit, Trash2, GripVertical, Layers } from 'lucide-react';

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  textarea: 'Text Area',
  number: 'Number',
  currency: 'Currency',
  date: 'Date',
  datetime: 'Date & Time',
  select: 'Select',
  multiselect: 'Multi-select',
  checkbox: 'Checkbox',
  url: 'URL',
  email: 'Email',
  phone: 'Phone',
  user: 'User',
  contact: 'Contact',
  company: 'Company',
};

interface CustomFieldListProps {
  entityType: 'contact' | 'company' | 'deal';
  onEdit: (field: CustomField) => void;
}

export function CustomFieldList({ entityType, onEdit }: CustomFieldListProps) {
  const { customFields, loading, error, updateCustomField, deleteCustomField, refetch: _refetch } =
    useCustomFields({ entityType, isActive: undefined });
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fieldToDelete, setFieldToDelete] = useState<string | null>(null);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);

  const handleToggleActive = async (field: CustomField) => {
    setToggleLoading(field._id);
    try {
      await updateCustomField(field._id, { isActive: !field.isActive });
      toast({ title: field.isActive ? 'Field deactivated' : 'Field activated' });
    } catch {
      toast({ variant: 'destructive', title: 'Failed to update field' });
    } finally {
      setToggleLoading(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!fieldToDelete) return;
    try {
      await deleteCustomField(fieldToDelete);
      toast({ title: 'Field deleted' });
      setDeleteDialogOpen(false);
      setFieldToDelete(null);
    } catch {
      toast({ variant: 'destructive', title: 'Failed to delete field' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-14" />)}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (customFields.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <Layers className="size-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No custom fields yet for {entityType}s.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {customFields.map(field => (
          <div
            key={field._id}
            className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
          >
            <GripVertical className="size-4 text-muted-foreground/40 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{field.fieldLabel}</span>
                <Badge variant="outline" className="text-[10px] font-normal">
                  {FIELD_TYPE_LABELS[field.fieldType] ?? field.fieldType}
                </Badge>
                {field.required && (
                  <Badge variant="destructive" className="text-[10px] font-normal">Required</Badge>
                )}
                {!field.isActive && (
                  <Badge variant="secondary" className="text-[10px] font-normal">Inactive</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-mono">{field.fieldKey}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Switch
                checked={field.isActive}
                disabled={toggleLoading === field._id}
                onCheckedChange={() => handleToggleActive(field)}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(field)}>
                    <Edit className="size-4 mr-2" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => { setFieldToDelete(field._id); setDeleteDialogOpen(true); }}
                  >
                    <Trash2 className="size-4 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Custom Field?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the field definition. Existing data stored in this field will not be affected, but the field will no longer appear in forms or lists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
