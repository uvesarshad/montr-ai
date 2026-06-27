'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, formatDistanceToNow, isToday } from 'date-fns';
import { Copy, FolderOpen, LayoutTemplate, Layers3, Search, Tag, Trash2, UploadCloud, Wand2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { ModuleShell } from '@/components/shell/module-shell';
import {
  SocialEmptyState,
  SocialStatCard,
  SocialStatGrid,
  SocialToolbar,
} from '@/components/social/social-workspace';
import {
  ActionMenu,
  Button,
  Chip,
  Field,
  FormDialog,
  Input,
  Segmented,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui-kit';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Brand {
  _id: string;
  name: string;
}

interface Template {
  _id: string;
  name: string;
  description?: string;
  content: string;
  media: { url: string; type: string }[];
  category?: string;
  tags: string[];
  usageCount: number;
  createdAt: string;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong';
}

function ViewToggle({
  value,
  onChange,
}: {
  value: 'list' | 'grid';
  onChange: (value: 'list' | 'grid') => void;
}) {
  return (
    <Segmented
      options={[
        { value: 'list', label: 'List' },
        { value: 'grid', label: 'Grid' },
      ]}
      value={value}
      onChange={(v) => onChange(v as 'list' | 'grid')}
    />
  );
}

function TemplateMenu({
  templateId,
  onUse,
  onDelete,
}: {
  templateId: string;
  onUse: (templateId: string) => void;
  onDelete: (templateId: string) => void;
}) {
  return (
    <ActionMenu
      items={[
        { label: 'Use template', icon: Copy, onSelect: () => onUse(templateId) },
        {
          label: 'Delete',
          icon: Trash2,
          danger: true,
          onSelect: () => {
            if (confirm('Delete this template?')) {
              onDelete(templateId);
            }
          },
        },
      ]}
    />
  );
}

export default function TemplatesPage() {
  const { push } = useRouter();
  const { toast } = useToast();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    content: '',
    category: '',
  });

  useEffect(() => {
    async function fetchBrands() {
      try {
        const response = await fetch('/api/social/brands');
        if (!response.ok) {
          throw new Error('Failed to load brands');
        }

        const data = await response.json();
        setBrands(data.brands || []);
        if (data.brands?.length > 0) {
          setSelectedBrandId(data.brands[0]._id);
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Failed to load brands',
          description: getErrorMessage(error),
        });
        setIsLoading(false);
      }
    }

    fetchBrands();
  }, [toast]);

  const fetchTemplates = useCallback(async () => {
    if (!selectedBrandId) {
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({ brandId: selectedBrandId });
      if (filterCategory !== 'all') {
        params.set('category', filterCategory);
      }

      const response = await fetch(`/api/social/templates?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to load templates');
      }

      const data = await response.json();
      setTemplates(data.templates || []);
      setCategories(data.categories || []);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to load templates',
        description: getErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, [filterCategory, selectedBrandId, toast]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const selectedBrand = useMemo(
    () => brands.find((brand) => brand._id === selectedBrandId) || null,
    [brands, selectedBrandId],
  );

  const handleCreate = async () => {
    if (!newTemplate.name.trim() || !newTemplate.content.trim()) {
      return;
    }

    try {
      const response = await fetch('/api/social/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: selectedBrandId, ...newTemplate }),
      });

      if (!response.ok) {
        throw new Error('Failed to create template');
      }

      toast({ title: 'Template created' });
      setNewTemplate({ name: '', description: '', content: '', category: '' });
      fetchTemplates();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to create template',
        description: getErrorMessage(error),
      });
      throw error;
    }
  };

  const handleDelete = async (templateId: string) => {
    try {
      const response = await fetch(`/api/social/templates?id=${templateId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete template');
      }

      setTemplates((current) => current.filter((template) => template._id !== templateId));
      setSelectedTemplates((current) => current.filter((id) => id !== templateId));
      toast({ title: 'Template deleted' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to delete template',
        description: getErrorMessage(error),
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTemplates.length === 0 || !confirm(`Delete ${selectedTemplates.length} templates?`)) {
      return;
    }

    await Promise.all(selectedTemplates.map((templateId) => handleDelete(templateId)));
    setSelectedTemplates([]);
  };

  const handleUse = (templateId: string) => {
    push(`/social/create-post?templateId=${templateId}`);
  };

  const filteredTemplates = useMemo(
    () =>
      templates.filter((template) => {
        const search = searchQuery.trim().toLowerCase();
        if (!search) {
          return true;
        }

        return (
          template.name.toLowerCase().includes(search) ||
          template.content.toLowerCase().includes(search)
        );
      }),
    [searchQuery, templates],
  );

  const templatesWithMedia = templates.filter((template) => template.media.length > 0).length;
  const usedTemplates = templates.filter((template) => template.usageCount > 0).length;
  const updatedToday = templates.filter((template) => isToday(new Date(template.createdAt))).length;

  const allSelected =
    filteredTemplates.length > 0 &&
    filteredTemplates.every((template) => selectedTemplates.includes(template._id));

  const toggleSelected = (templateId: string) => {
    setSelectedTemplates((current) =>
      current.includes(templateId)
        ? current.filter((id) => id !== templateId)
        : [...current, templateId],
    );
  };

  const toggleSelectAll = () => {
    setSelectedTemplates(allSelected ? [] : filteredTemplates.map((template) => template._id));
  };

  const primaryAction = (
    <Button size="sm" onClick={() => setCreateOpen(true)}>
      <Wand2 className="mr-2 size-4" />
      New template
    </Button>
  );

  const filterBar = (
    <SocialToolbar>
      <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
        {brands.length > 1 ? (
          <Select
            value={selectedBrandId}
            onChange={setSelectedBrandId}
            placeholder="Select brand"
            triggerClassName="w-full lg:w-[220px]"
            options={brands.map((brand) => ({ value: brand._id, label: brand.name }))}
          />
        ) : null}

        <Input
          icon={Search}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search templates..."
          wrapClassName="lg:max-w-sm lg:flex-1"
        />

        <Select
          value={filterCategory}
          onChange={setFilterCategory}
          placeholder="All categories"
          triggerClassName="w-full lg:w-[200px]"
          options={[
            { value: 'all', label: 'All categories' },
            ...categories.map((category) => ({ value: category, label: category })),
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {selectedTemplates.length > 0 ? (
          <>
            <Chip tone="brand">{selectedTemplates.length} selected</Chip>
            <Button variant="outline" size="sm" onClick={() => setSelectedTemplates([])}>
              Clear
            </Button>
            <Button variant="primary" size="sm" icon={Trash2} onClick={handleBulkDelete}>
              Delete
            </Button>
          </>
        ) : null}
        <ViewToggle value={viewMode} onChange={setViewMode} />
      </div>
    </SocialToolbar>
  );

  if (!isLoading && brands.length === 0) {
    return (
      <ModuleShell title="Templates" icon={LayoutTemplate} primaryAction={primaryAction} contentClassName="flex flex-col gap-3 pb-8">
        <SocialEmptyState
          icon={Layers3}
          title="No brands yet"
          description="Create a brand before saving post templates."
          action={{ label: 'Open settings', href: '/settings?tab=connections' }}
        />
      </ModuleShell>
    );
  }

  return (
    <ModuleShell
      title="Templates"
      icon={LayoutTemplate}
      meta={selectedBrand ? `${selectedBrand.name} · ${templates.length} templates` : `${templates.length} templates`}
      primaryAction={primaryAction}
      filterBar={filterBar}
      contentClassName="flex flex-col gap-3 pb-8"
    >
      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New template"
        description="Save reusable post copy for future campaigns."
        icon={Wand2}
        submitLabel="Save"
        submitDisabled={!newTemplate.name.trim() || !newTemplate.content.trim()}
        onSubmit={handleCreate}
      >
        <Field label="Name" htmlFor="template-name">
          <Input
            id="template-name"
            value={newTemplate.name}
            onChange={(event) =>
              setNewTemplate((current) => ({ ...current, name: event.target.value }))
            }
            placeholder="e.g. Weekly product update"
          />
        </Field>
        <Field label="Category" htmlFor="template-category">
          <Input
            id="template-category"
            value={newTemplate.category}
            onChange={(event) =>
              setNewTemplate((current) => ({ ...current, category: event.target.value }))
            }
            placeholder="e.g. Product"
          />
        </Field>
        <Field label="Description" htmlFor="template-description">
          <Input
            id="template-description"
            value={newTemplate.description}
            onChange={(event) =>
              setNewTemplate((current) => ({ ...current, description: event.target.value }))
            }
            placeholder="Short note for the team"
          />
        </Field>
        <Field label="Content" htmlFor="template-content">
          <Textarea
            id="template-content"
            value={newTemplate.content}
            onChange={(event) =>
              setNewTemplate((current) => ({ ...current, content: event.target.value }))
            }
            placeholder="Write the base caption..."
            rows={6}
          />
        </Field>
      </FormDialog>

      <SocialStatGrid>
        <SocialStatCard
          label="Templates"
          value={String(templates.length)}
          helper={`${filteredTemplates.length} visible`}
          icon={FolderOpen}
          tone="purple"
        />
        <SocialStatCard
          label="With media"
          value={String(templatesWithMedia)}
          helper="Ready for visual posts"
          icon={UploadCloud}
          tone="blue"
        />
        <SocialStatCard
          label="Used"
          value={String(usedTemplates)}
          helper="Applied at least once"
          icon={Copy}
          tone="green"
        />
        <SocialStatCard
          label="Added today"
          value={String(updatedToday)}
          helper="New reusable copy"
          icon={Tag}
          tone="amber"
        />
      </SocialStatGrid>

      {isLoading ? (
        <div className={cn('grid gap-4', viewMode === 'grid' ? 'md:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1')}>
          {Array.from({ length: viewMode === 'grid' ? 6 : 4 }).map((_, index) => (
            <Skeleton key={`skeleton-${index}`} className="h-36 rounded-[24px]" />
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <SocialEmptyState
          icon={FolderOpen}
          title={templates.length === 0 ? 'No templates yet' : 'No results'}
          description={
            templates.length === 0
              ? 'Save reusable post copy to move faster in the composer.'
              : 'No templates match your search.'
          }
          action={{ label: 'New template', onClick: () => setCreateOpen(true) }}
        />
      ) : viewMode === 'list' ? (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-[40px_minmax(0,1.1fr)_minmax(0,1.5fr)_120px_110px_56px] items-center gap-3 border-b border-border bg-secondary/40 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} />
            <span>Name</span>
            <span>Preview</span>
            <span>Category</span>
            <span>Used</span>
            <span />
          </div>
          <div className="divide-y divide-border/50">
            {filteredTemplates.map((template) => (
              <div
                key={template._id}
                className="grid grid-cols-[40px_minmax(0,1.1fr)_minmax(0,1.5fr)_120px_110px_56px] items-center gap-3 px-4 py-4 transition-colors hover:bg-background/60"
              >
                <Checkbox
                  checked={selectedTemplates.includes(template._id)}
                  onCheckedChange={() => toggleSelected(template._id)}
                />
                <button type="button" onClick={() => handleUse(template._id)} className="min-w-0 text-left">
                  <p className="truncate text-sm font-medium">{template.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Added {formatDistanceToNow(new Date(template.createdAt), { addSuffix: true })}
                  </p>
                </button>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {template.content}
                </p>
                <div>
                  {template.category ? (
                    <Chip tone="gray">{template.category}</Chip>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">{template.usageCount}</div>
                <TemplateMenu
                  templateId={template._id}
                  onUse={handleUse}
                  onDelete={handleDelete}
                />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredTemplates.map((template) => {
            const isSelected = selectedTemplates.includes(template._id);

            return (
              <div
                key={template._id}
                className={cn(
                  'rounded-lg border border-border bg-card p-5 shadow-card',
                  isSelected && 'border-brand/40 ring-2 ring-brand/15',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-brand-muted p-3 text-brand-strong">
                      <FolderOpen className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{template.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(template.createdAt), 'MMM d')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelected(template._id)}
                    />
                    <TemplateMenu
                      templateId={template._id}
                      onUse={handleUse}
                      onDelete={handleDelete}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUse(template._id)}
                  className="mt-4 w-full text-left"
                >
                  <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {template.content}
                  </p>
                </button>
                <div className="mt-4 flex flex-wrap gap-2">
                  {template.category ? <Chip tone="brand">{template.category}</Chip> : null}
                  {template.tags.slice(0, 2).map((tag) => (
                    <Chip key={tag} tone="gray">
                      {tag}
                    </Chip>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Used {template.usageCount} time{template.usageCount === 1 ? '' : 's'}</span>
                  <span>{formatDistanceToNow(new Date(template.createdAt), { addSuffix: true })}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ModuleShell>
  );
}
