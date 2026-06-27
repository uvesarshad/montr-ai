'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FilterBuilder } from './filter-builder';
import { View, ViewEntityType, ViewVisibility, ViewFilter } from '@/types/crm';
import { createViewSchema, CreateViewInput } from '@/validations/crm/view.schema';
import { useToast } from '@/hooks/use-toast';
import {
  buildNewViewEditorState,
  buildViewEditorStateFromView,
  getViewEditorColumns,
  legacyFiltersToTree,
  emptyFilterTree,
} from './view-editor-state';
import type { FilterTree } from '@/lib/crm/filter-query';
import { getGroupableFields } from '@/components/crm/shared/groupable-fields';

const GROUP_BY_NONE = '__none__';

function ColumnsTabContent({
  availableColumns,
  selectedColumns,
  onToggleColumn,
}: {
  availableColumns: { value: string; label: string }[];
  selectedColumns: string[];
  onToggleColumn: (columnValue: string) => void;
}) {
  return (
    <div>
      <h4 className="text-sm font-medium mb-3">Select Columns to Display</h4>
      <p className="text-sm text-muted-foreground mb-4">
        Choose which columns to show in the table view.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {availableColumns.map((column) => (
          <div key={column.value} className="flex items-center space-x-2">
            <Checkbox
              id={column.value}
              checked={selectedColumns.includes(column.value)}
              onCheckedChange={() => onToggleColumn(column.value)}
            />
            <Label
              htmlFor={column.value}
              className="text-sm font-normal cursor-pointer"
            >
              {column.label}
            </Label>
          </div>
        ))}
      </div>

      {selectedColumns.length === 0 && (
        <p className="text-sm text-destructive mt-3">
          Please select at least one column to display.
        </p>
      )}
    </div>
  );
}

interface ViewEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view?: View | null;
  entityType?: ViewEntityType;
  initialFilters?: CreateViewInput['filters'];
  onSave: (view: View) => void;
}

export function ViewEditor({
  open,
  onOpenChange,
  view,
  entityType: initialEntityType = 'contact',
  initialFilters = [],
  onSave,
}: ViewEditorProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<ViewFilter[]>(initialFilters as ViewFilter[]);
  const [filterTree, setFilterTree] = useState<FilterTree>(() =>
    legacyFiltersToTree(initialFilters as ViewFilter[]),
  );
  const [selectedEntityType, setSelectedEntityType] = useState<ViewEntityType>(
    view?.entityType || initialEntityType
  );

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<CreateViewInput>({
    resolver: zodResolver(createViewSchema),
    defaultValues: {
      name: '',
      entityType: selectedEntityType,
      filters: [],
      columns: [],
      columnWidths: {},
      visibility: 'private',
      sharedWith: [],
      isPinned: false,
      isDefault: false,
      openRecordIn: 'panel',
    },
  });

  const visibility = watch('visibility');
  const openRecordIn = watch('openRecordIn');
  const groupBy = watch('groupBy');
  const isPinned = watch('isPinned');
  const isDefault = watch('isDefault');

  useEffect(() => {
    if (!open) {
      return;
    }

    if (view) {
      const state = buildViewEditorStateFromView(view);

      // @ts-expect-error
      reset({
        name: view.name,
        entityType: view.entityType,
        icon: view.icon,
        color: view.color,
        filters: state.filters,
        sort: view.sort,
        columns: state.selectedColumns,
        columnWidths: view.columnWidths,
        groupBy: view.groupBy,
        visibility: view.visibility,
        sharedWith: view.sharedWith,
        isPinned: view.isPinned,
        isDefault: view.isDefault,
        openRecordIn: view.openRecordIn ?? 'panel',
      });
      setSelectedEntityType(view.entityType);
      setSelectedColumns(state.selectedColumns);
      setFilters(state.filters);
      // filterTree wins when present; otherwise convert legacy flat filters
      // into a single root group so the editor always shows a tree.
      const viewTree = (view as { filterTree?: FilterTree }).filterTree;
      setFilterTree(viewTree ?? legacyFiltersToTree(state.filters));
      return;
    }

    // @ts-expect-error
    const state = buildNewViewEditorState(initialEntityType, initialFilters);

    // @ts-expect-error
    reset({
      name: '',
      entityType: initialEntityType,
      filters: state.filters,
      columns: state.selectedColumns,
      columnWidths: {},
      visibility: 'private',
      sharedWith: [],
      isPinned: false,
      isDefault: false,
      openRecordIn: 'panel',
    });
    setSelectedEntityType(initialEntityType);
    setSelectedColumns(state.selectedColumns);
    setFilters(state.filters);
    setFilterTree(
      (initialFilters as ViewFilter[]).length
        ? legacyFiltersToTree(initialFilters as ViewFilter[])
        : emptyFilterTree(),
    );
  }, [open, view, initialEntityType, initialFilters, reset]);

  const onSubmit = async (data: CreateViewInput) => {
    try {
      setSaving(true);

      const payload = {
        ...data,
        entityType: selectedEntityType,
        // Legacy flat list kept untouched for back-compat read paths; the new
        // editor writes the nested tree which wins at query time.
        filters,
        filterTree,
        columns: selectedColumns,
      };

      const url = view ? `/api/v2/crm/views/${view._id}` : '/api/v2/crm/views';
      const method = view ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${view ? 'update' : 'create'} view`);
      }

      const savedView = await response.json();

      toast({
        title: view ? 'View updated' : 'View created',
        description: `The view "${data.name}" has been successfully ${view ? 'updated' : 'created'}.`,
      });

      onSave(savedView);
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving view:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save view',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleColumn = (columnValue: string) => {
    setSelectedColumns((prev) =>
      prev.includes(columnValue)
        ? prev.filter((column) => column !== columnValue)
        : [...prev, columnValue]
    );
  };

  const availableColumns = getViewEditorColumns(selectedEntityType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{view ? 'Edit View' : 'Create New View'}</DialogTitle>
          <DialogDescription>
            {view
              ? 'Update your saved view configuration.'
              : 'Create a custom view with filters and column selection.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-hidden flex flex-col">
          <Tabs defaultValue="general" className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="filters">Filters</TabsTrigger>
              <TabsTrigger value="columns">Columns</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 pr-4">
              <TabsContent value="general" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">View Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., High Priority Deals"
                    {...register('name')}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="entityType">Entity Type *</Label>
                  <Select
                    value={selectedEntityType}
                    onValueChange={(value: ViewEntityType) => {
                      setSelectedEntityType(value);
                      setValue('entityType', value);
                      setSelectedColumns(buildNewViewEditorState(value).selectedColumns);
                      setFilterTree(emptyFilterTree());
                    }}
                    disabled={!!view}
                  >
                    <SelectTrigger id="entityType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contact">Contacts</SelectItem>
                      <SelectItem value="company">Companies</SelectItem>
                      <SelectItem value="deal">Deals</SelectItem>
                      <SelectItem value="activity">Activities</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="visibility">Visibility</Label>
                  <Select
                    value={visibility}
                    onValueChange={(value: ViewVisibility) => setValue('visibility', value)}
                  >
                    <SelectTrigger id="visibility">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="private">Private (Only me)</SelectItem>
                      <SelectItem value="team">Team (My team members)</SelectItem>
                      <SelectItem value="organization">Organization (Everyone)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="openRecordIn">Open records in</Label>
                  <Select
                    value={openRecordIn ?? 'panel'}
                    onValueChange={(value: 'panel' | 'page') => setValue('openRecordIn', value)}
                  >
                    <SelectTrigger id="openRecordIn">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="panel">Side panel</SelectItem>
                      <SelectItem value="page">Full page</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Choose what happens when you click a row in this view.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="groupBy">Group by</Label>
                  <Select
                    value={groupBy || GROUP_BY_NONE}
                    onValueChange={(value) =>
                      setValue('groupBy', value === GROUP_BY_NONE ? undefined : value)
                    }
                  >
                    <SelectTrigger id="groupBy">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={GROUP_BY_NONE}>None</SelectItem>
                      {getGroupableFields(selectedEntityType).map((field) => (
                        <SelectItem key={field.value} value={field.value}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Collapsible groups on the current page (groups split across pages).
                  </p>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="isPinned">Pin to Sidebar</Label>
                      <p className="text-sm text-muted-foreground">
                        Show this view in the sidebar for quick access
                      </p>
                    </div>
                    <Switch
                      id="isPinned"
                      checked={isPinned}
                      onCheckedChange={(checked) => setValue('isPinned', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="isDefault">Set as Default</Label>
                      <p className="text-sm text-muted-foreground">
                        Use this view as the default for this entity type
                      </p>
                    </div>
                    <Switch
                      id="isDefault"
                      checked={isDefault}
                      onCheckedChange={(checked) => setValue('isDefault', checked)}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="filters" className="mt-4">
                <FilterBuilder
                  entityType={selectedEntityType}
                  tree={filterTree}
                  onChange={setFilterTree}
                />
              </TabsContent>

              <TabsContent value="columns" className="space-y-4 mt-4">
                <ColumnsTabContent
                  availableColumns={availableColumns}
                  selectedColumns={selectedColumns}
                  onToggleColumn={toggleColumn}
                />
              </TabsContent>
            </ScrollArea>
          </Tabs>

          <DialogFooter className="mt-4 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || selectedColumns.length === 0}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {view ? 'Update View' : 'Create View'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
